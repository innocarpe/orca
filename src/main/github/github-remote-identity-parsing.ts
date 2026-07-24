import type { GitHubOwnerRepo } from '../../shared/types'

export type GitHubRemoteIdentity = GitHubOwnerRepo & { host: string }

export function normalizeGitHubRemoteHost(host: string): string {
  const normalizedHost = host.toLowerCase()
  // Why: GitHub documents ssh.github.com as SSH-over-HTTPS for github.com repos.
  return normalizedHost === 'ssh.github.com' ? 'github.com' : normalizedHost
}

export function isGitHubDotComHost(host: string): boolean {
  return normalizeGitHubRemoteHost(host) === 'github.com'
}

// Why: HTTP ports identify the GHES web/API endpoint; SSH and git ports are
// transport-only and must not leak into gh's host identity.
function hostFromRemoteUrl(url: URL): string {
  const protocol = url.protocol.toLowerCase()
  return protocol === 'http:' || protocol === 'https:' ? url.host : url.hostname
}

function parseGitHubRemotePath(path: string): Pick<GitHubRemoteIdentity, 'owner' | 'repo'> | null {
  const parts = path.replace(/^\/+/, '').replace(/\/+$/, '').split('/')
  if (parts.length !== 2) {
    return null
  }
  const [owner, repoWithSuffix] = parts
  const repo = repoWithSuffix.replace(/\.git$/i, '')
  if (!owner || !repo) {
    return null
  }
  return { owner, repo }
}

export function parseGitHubRemoteIdentity(remoteUrl: string): GitHubRemoteIdentity | null {
  const trimmed = remoteUrl.trim()
  const sshMatch = trimmed.match(/^git@([^:]+):([^/]+)\/([^/]+?)(?:\.git)?$/i)
  if (sshMatch) {
    return { host: normalizeGitHubRemoteHost(sshMatch[1]), owner: sshMatch[2], repo: sshMatch[3] }
  }

  try {
    const url = new URL(trimmed)
    if (!['git:', 'git+ssh:', 'http:', 'https:', 'ssh:'].includes(url.protocol.toLowerCase())) {
      return null
    }
    const path = parseGitHubRemotePath(url.pathname)
    return path ? { host: normalizeGitHubRemoteHost(hostFromRemoteUrl(url)), ...path } : null
  } catch {
    return null
  }
}

export function parseGitHubOwnerRepo(remoteUrl: string): GitHubOwnerRepo | null {
  const identity = parseGitHubRemoteIdentity(remoteUrl)
  if (!identity || !isGitHubDotComHost(identity.host)) {
    return null
  }
  return { owner: identity.owner, repo: identity.repo }
}

/** Pure helper: map an SSH config Host alias to HostName when present. */
export function hostnameFromSshConfigHosts(
  alias: string,
  hosts: readonly { host: string; hostname?: string }[]
): string | null {
  const entry = hosts.find((host) => host.host === alias)
  const hostname = entry?.hostname?.trim()
  return hostname ? hostname : null
}

/**
 * When the remote host token is an SSH config Host alias (e.g. github-work →
 * ssh.github.com), re-check github.com after the alias is expanded.
 */
export function parseGitHubOwnerRepoWithResolvedHostname(
  remoteUrl: string,
  resolvedHostname: string
): GitHubOwnerRepo | null {
  const direct = parseGitHubOwnerRepo(remoteUrl)
  if (direct) {
    return direct
  }
  const identity = parseGitHubRemoteIdentity(remoteUrl)
  if (!identity || isGitHubDotComHost(identity.host)) {
    return null
  }
  if (!isGitHubDotComHost(resolvedHostname)) {
    return null
  }
  return { owner: identity.owner, repo: identity.repo }
}
