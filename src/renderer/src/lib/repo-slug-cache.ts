// Why: the slug → Repo cache and its synchronous lookup live here (separate from
// repo-slug-index.ts) so store slices can import the sync lookup without pulling
// in repo-slug-index's `@/store` dependency, which would form an import cycle.
import type { GlobalSettings, Repo } from '../../../shared/types'
import { getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import { getSettingsForRepoRuntimeOwner } from './repo-runtime-owner'
import {
  githubHostFromIdentityKey,
  githubRepoIdentityKey
} from '../../../shared/github-repository-identity-key'

/** Lowercased `owner/repo` → Repo[]. */
export type SlugIndex = Map<string, Repo[]>

/** The two ways a slug can match a repo, kept apart so callers that also filter
 *  by repo selection can fall through to `upstream` instead of letting an
 *  unselected clone of the upstream repo shadow the selected fork. */
export type RepoSlugMatches = { origin: Repo[]; upstream: Repo[] }

/** Identity key of a fork's upstream parent, resolved once at repo-add time and
 *  persisted on the Repo record (`undefined` = unresolved, `null` = not a fork).
 *  Why: Project cards reference the upstream repo while a contributor's clone
 *  has the personal fork as `origin`, so upstream is a second identity a row
 *  may legitimately match.
 *
 *  `originHost` is the host of the repo's own origin remote. Persistence strips
 *  `upstream.host` (`sanitizeRepoUpstream`), and a fork's parent always lives on
 *  the fork's own server — without this the key lands in the github.com
 *  namespace, so a GHES row would never match and a github.com row would bind
 *  the wrong clone. */
export function repoUpstreamIdentityKey(repo: Repo, originHost?: string): string | null {
  const upstream = repo.upstream
  if (!upstream?.owner || !upstream.repo) {
    return null
  }
  return githubRepoIdentityKey({ ...upstream, host: upstream.host ?? originHost })
}

/** Module-scope cache keyed by runtime scope + repo.id. A Repo that has already
 *  failed resolution is recorded as `null` briefly so it is not retried on every
 *  cell mount, while still recovering after an external GHES auth login. */
export const slugByRepoId = new Map<string, string | null>()
const slugFailureExpiresAtByRepoId = new Map<string, number>()
export const REPO_SLUG_FAILURE_TTL_MS = 60_000

export function readRepoSlugCache(
  cacheKey: string,
  now = Date.now()
): { hit: true; value: string | null } | { hit: false } {
  if (!slugByRepoId.has(cacheKey)) {
    return { hit: false }
  }
  const value = slugByRepoId.get(cacheKey) ?? null
  const failureExpiry = slugFailureExpiresAtByRepoId.get(cacheKey)
  if (value !== null || failureExpiry === undefined || failureExpiry > now) {
    return { hit: true, value }
  }
  slugByRepoId.delete(cacheKey)
  slugFailureExpiresAtByRepoId.delete(cacheKey)
  return { hit: false }
}

export function rememberRepoSlug(cacheKey: string, value: string | null, now = Date.now()): void {
  slugByRepoId.set(cacheKey, value)
  if (value === null) {
    slugFailureExpiresAtByRepoId.set(cacheKey, now + REPO_SLUG_FAILURE_TTL_MS)
  } else {
    slugFailureExpiresAtByRepoId.delete(cacheKey)
  }
}

export function deleteRepoSlugCacheKey(cacheKey: string): void {
  slugByRepoId.delete(cacheKey)
  slugFailureExpiresAtByRepoId.delete(cacheKey)
}

export function clearRepoSlugCacheValues(): void {
  slugByRepoId.clear()
  slugFailureExpiresAtByRepoId.clear()
}

export function nextRepoSlugFailureRetryDelay(
  cacheKeys: ReadonlySet<string>,
  now = Date.now()
): number | null {
  let earliestExpiry = Number.POSITIVE_INFINITY
  for (const cacheKey of cacheKeys) {
    if (slugByRepoId.get(cacheKey) !== null) {
      continue
    }
    const expiresAt = slugFailureExpiresAtByRepoId.get(cacheKey)
    if (expiresAt !== undefined) {
      earliestExpiry = Math.min(earliestExpiry, expiresAt)
    }
  }
  return Number.isFinite(earliestExpiry) ? Math.max(0, earliestExpiry - now) : null
}

export function slugCacheKey(
  repoId: string,
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined
): string {
  const target = getActiveRuntimeTarget(settings)
  return `${target.kind === 'environment' ? `runtime:${target.environmentId}` : 'local'}:${repoId}`
}

export function settingsForRepoOwner(
  repo: Repo,
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined
): Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> {
  return getSettingsForRepoRuntimeOwner({ repos: [repo], settings }, repo.id)
}

/** Synchronous slug → Repo lookup against the already-resolved module cache.
 *  Used by store slices (which can't run the async hook-based index) to route
 *  project-row mutations to the matched repo's owner host; callers fall back to
 *  focused settings when nothing matches. Origin matches win over upstream ones
 *  so a clone of the upstream repo itself is never shadowed by someone's fork. */
export function lookupReposBySlugFromCache(
  repos: readonly Repo[],
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  slug: string | null | undefined,
  host?: string
): Repo[] {
  const [owner, repo] = slug?.split('/') ?? []
  if (!owner || !repo) {
    return []
  }
  const target = githubRepoIdentityKey({ owner, repo, host })
  const matched: Repo[] = []
  const upstreamMatched: Repo[] = []
  for (const repo of repos) {
    const cacheKey = slugCacheKey(repo.id, settingsForRepoOwner(repo, settings))
    const originKey = slugByRepoId.get(cacheKey)
    if (originKey === target) {
      matched.push(repo)
    } else if (repoUpstreamIdentityKey(repo, githubHostFromIdentityKey(originKey)) === target) {
      upstreamMatched.push(repo)
    }
  }
  return matched.length > 0 ? matched : upstreamMatched
}
