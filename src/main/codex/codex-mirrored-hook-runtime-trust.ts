import {
  codexAppServerCapabilityCache,
  getCodexAppServerHostKey
} from './codex-app-server-capability-cache'
import { runCodexUserHookTrustRebaseSessionSync } from './codex-app-server-grant-bridge'
import { isCodexAppServerUnsupportedError } from './codex-app-server-session'
import { CODEX_TRUST_GRANT_TRANSIENT_RETRY_INTERVAL_MS } from './codex-hook-trust-grant'
import { resolveCodexTrustGrantHost } from './codex-trust-grant-host'
import type { CodexHookCurrentHashListing } from './codex-user-hook-trust-rebase-client'
import {
  computeTrustKey,
  getHookTrustKeyWriteVariants,
  normalizeHookTrustKeyForLookup,
  readHookTrustEntries,
  removeHookTrustEntries,
  type CodexTrustEntry
} from './config-toml-trust'

export type { CodexHookCurrentHashListing }

type MirroredHookCurrentHashListRunner = (
  runtimeHomePath: string
) => readonly CodexHookCurrentHashListing[]

let listRunner: MirroredHookCurrentHashListRunner | null = null
const listRetryAfterByHost = new Map<string, number>()

export function stampMirroredRuntimeTrustWithCurrentHashes(
  entries: readonly CodexTrustEntry[],
  listings: readonly CodexHookCurrentHashListing[]
): CodexTrustEntry[] {
  const listingByKey = new Map<string, CodexHookCurrentHashListing>()
  for (const listing of listings) {
    const normalizedKey = normalizeHookTrustKeyForLookup(listing.key)
    if (!listingByKey.has(normalizedKey)) {
      listingByKey.set(normalizedKey, listing)
    }
  }
  return entries.map((entry) => {
    const listing = listingByKey.get(normalizeHookTrustKeyForLookup(computeTrustKey(entry)))
    if (!listing) {
      return entry
    }
    // Why: command:null is an incomplete hooks/list record, not a match.
    if (listing.command !== entry.command) {
      return entry
    }
    return { ...entry, trustedHash: listing.currentHash }
  })
}

export function clearHookTrustKeySeparatorVariants(
  tomlPath: string,
  keys: readonly string[]
): void {
  if (keys.length === 0) {
    return
  }
  removeHookTrustEntries(
    tomlPath,
    keys.flatMap((key) => getHookTrustKeyWriteVariants(key))
  )
}

export function resolveMirroredRuntimeUserHookTrustEntries(args: {
  entries: readonly CodexTrustEntry[]
  runtimeHomePath: string
  tomlPath: string
}): CodexTrustEntry[] {
  if (args.entries.length === 0) {
    return []
  }
  const listings = tryListMirroredHookCurrentHashes(args.runtimeHomePath)
  if (listings) {
    return stampMirroredRuntimeTrustWithCurrentHashes(args.entries, listings)
  }
  return preserveExistingRuntimeHashes(args.entries, args.tomlPath)
}

function preserveExistingRuntimeHashes(
  entries: readonly CodexTrustEntry[],
  tomlPath: string
): CodexTrustEntry[] {
  const existing = readHookTrustEntries(tomlPath)
  return entries.map((entry) => {
    const trustedHash = existing.get(computeTrustKey(entry))?.trustedHash
    return trustedHash ? { ...entry, trustedHash } : entry
  })
}

function tryListMirroredHookCurrentHashes(
  runtimeHomePath: string
): readonly CodexHookCurrentHashListing[] | null {
  if (listRunner) {
    return listRunner(runtimeHomePath)
  }
  const hostKey = getCodexAppServerHostKey({ kind: 'native' })
  if (!codexAppServerCapabilityCache.shouldTry(hostKey)) {
    return null
  }
  const retryAfterMs = listRetryAfterByHost.get(hostKey)
  if (retryAfterMs !== undefined) {
    if (Date.now() < retryAfterMs) {
      return null
    }
    listRetryAfterByHost.delete(hostKey)
  }
  try {
    const request = resolveCodexTrustGrantHost({ kind: 'native' }).buildRequest({
      runtimeHomePath,
      managedCommand: '',
      expectedTrustKeys: []
    })
    const result = runCodexUserHookTrustRebaseSessionSync({
      operation: 'list-hook-current-hashes',
      invocation: request.invocation,
      hooksListCwd: request.hooksListCwd
    })
    if (result.outcome !== 'listed') {
      return null
    }
    listRetryAfterByHost.delete(hostKey)
    codexAppServerCapabilityCache.rememberSupported(hostKey)
    return result.listings
  } catch (error) {
    if (isCodexAppServerUnsupportedError(error)) {
      listRetryAfterByHost.delete(hostKey)
      codexAppServerCapabilityCache.rememberUnsupported(hostKey)
      return null
    }
    listRetryAfterByHost.set(hostKey, Date.now() + CODEX_TRUST_GRANT_TRANSIENT_RETRY_INTERVAL_MS)
    return null
  }
}

export const _internals = {
  setListRunner(runner: MirroredHookCurrentHashListRunner | null): void {
    listRunner = runner
  },
  resetRetryState(): void {
    listRetryAfterByHost.clear()
  }
}
