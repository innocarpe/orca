import type { GitHubOwnerRepo } from '../../shared/types'
import { loadUserSshConfig } from '../ssh/ssh-config-parser'
import { resolveWithSshG } from '../ssh/ssh-g-config-resolution'
import {
  hostnameFromSshConfigHosts,
  parseGitHubOwnerRepo,
  parseGitHubOwnerRepoWithResolvedHostname,
  parseGitHubRemoteIdentity
} from './github-remote-identity-parsing'

// Why: skip ssh -G for already-qualified hostnames (GHES / public forges) —
// they are not Host aliases and spawning ssh on every miss is pure cost.
function isLikelyLiteralHost(host: string): boolean {
  return host.includes('.')
}

async function resolveSshAliasHostname(alias: string): Promise<string | null> {
  // Why: ~/.ssh/config Host → HostName covers the common multi-account alias
  // case without spawning ssh; fall back to `ssh -G` for Include/Match.
  const fromConfig = hostnameFromSshConfigHosts(alias, loadUserSshConfig())
  if (fromConfig) {
    return fromConfig
  }
  if (isLikelyLiteralHost(alias)) {
    return null
  }
  const resolved = await resolveWithSshG(alias)
  const hostname = resolved?.hostname?.trim()
  return hostname ? hostname : null
}

/**
 * Resolve github.com owner/repo, expanding SSH config Host aliases when the
 * remote host token is not literally github.com (#10284).
 */
export async function resolveGitHubOwnerRepoFromRemoteUrl(
  remoteUrl: string
): Promise<GitHubOwnerRepo | null> {
  const direct = parseGitHubOwnerRepo(remoteUrl)
  if (direct) {
    return direct
  }
  const identity = parseGitHubRemoteIdentity(remoteUrl)
  if (!identity) {
    return null
  }
  // Why: SSH config Host aliases (git@github-work:org/repo) keep a non-github
  // host token in remote.origin.url; expand HostName before classifying.
  const resolvedHostname = await resolveSshAliasHostname(identity.host)
  if (!resolvedHostname) {
    return null
  }
  return parseGitHubOwnerRepoWithResolvedHostname(remoteUrl, resolvedHostname)
}
