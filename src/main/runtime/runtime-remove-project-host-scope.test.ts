/**
 * The same repo id is allowed on two execution hosts (persistence.ts `removeProjectForHost`).
 * `repo.rm` resolves a *row*, so the deletion it performs must be scoped to that row's host:
 * `Store.removeProject` is id-only and would take the sibling host's registration with it.
 * A `path:`/`name:` selector resolves unambiguously even when the id is duplicated, so this
 * is reachable — and since #11994 every paired device now learns about it immediately.
 */
import { describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../shared/types'
import type { PtyProcessInfo } from '../providers/types'
import { OrcaRuntimeService } from './orca-runtime'

function makeRepos(): Repo[] {
  return [
    {
      id: 'dup',
      path: '/laptop/dup',
      displayName: 'Dup Local',
      badgeColor: '#000',
      addedAt: 1,
      executionHostId: 'local'
    } as Repo,
    {
      id: 'dup',
      path: '/remote/dup',
      displayName: 'Dup Remote',
      badgeColor: '#000',
      addedAt: 2,
      connectionId: 'ssh-1'
    } as Repo
  ]
}

function createRuntime(providerProcesses: PtyProcessInfo[] = []) {
  const repos = makeRepos()
  const removeProject = vi.fn((id: string) => {
    for (let index = repos.length - 1; index >= 0; index -= 1) {
      if (repos[index].id === id) {
        repos.splice(index, 1)
      }
    }
  })
  const removeProjectForHost = vi.fn((id: string, hostId: string) => {
    for (let index = repos.length - 1; index >= 0; index -= 1) {
      const repo = repos[index]
      const repoHostId =
        repo.executionHostId ?? (repo.connectionId ? `ssh:${repo.connectionId}` : 'local')
      if (repo.id === id && repoHostId === hostId) {
        repos.splice(index, 1)
      }
    }
  })
  const provider = {
    listProcesses: vi.fn().mockResolvedValue(providerProcesses),
    shutdown: vi.fn().mockResolvedValue(undefined)
  }
  const runtime = new OrcaRuntimeService(
    {
      getRepos: () => [...repos],
      getRepo: (id: string) => repos.find((repo) => repo.id === id) ?? null,
      getAllWorktreeMeta: () => ({}),
      getWorktreeMeta: () => null,
      setWorktreeMeta: vi.fn(),
      removeWorktreeMeta: vi.fn(),
      getGitHubCache: () => null,
      removeProject,
      removeProjectForHost
    } as never,
    undefined,
    {
      getLocalProvider: () => provider as never,
      getSshProvider: () => provider as never
    }
  )
  return { runtime, repos, removeProject, removeProjectForHost, provider }
}

describe('repo.rm with the same repo id on two execution hosts', () => {
  it('removes only the resolved row when a path selector picks the SSH host copy', async () => {
    const { runtime, repos } = createRuntime()

    await runtime.removeProject('path:/remote/dup')

    expect(repos.map((repo) => repo.path)).toEqual(['/laptop/dup'])
  })

  it('removes only the resolved row when a name selector picks the local copy', async () => {
    const { runtime, repos } = createRuntime()

    await runtime.removeProject('name:Dup Local')

    expect(repos.map((repo) => repo.path)).toEqual(['/remote/dup'])
  })

  it('refuses a bare duplicated id rather than guessing a host', async () => {
    const { runtime, repos, removeProject, removeProjectForHost } = createRuntime()

    await expect(runtime.removeProject('dup')).rejects.toThrow('selector_ambiguous')
    expect(removeProject).not.toHaveBeenCalled()
    expect(removeProjectForHost).not.toHaveBeenCalled()
    expect(repos).toHaveLength(2)
  })

  it('stops provider-only sessions before removing the owning host row', async () => {
    const owned = {
      id: 'ssh:ssh-1@@owned',
      cwd: '/remote/dup',
      title: 'codex',
      worktreeId: 'dup::/remote/dup'
    }
    const unrelated = {
      id: 'ssh:ssh-1@@unrelated',
      cwd: '/remote/other',
      title: 'shell',
      worktreeId: 'other::/remote/other'
    }
    const ownedWorktree = {
      id: 'ssh:ssh-1@@owned-worktree',
      cwd: '/remote/worktree',
      title: 'claude',
      worktreeId: 'dup::/remote/worktree'
    }
    const { runtime, provider, removeProjectForHost } = createRuntime([
      owned,
      ownedWorktree,
      unrelated
    ])

    await runtime.removeProject('path:/remote/dup')

    expect(provider.listProcesses).toHaveBeenCalledTimes(1)
    expect(provider.shutdown).toHaveBeenCalledWith(
      owned.id,
      expect.objectContaining({ immediate: true })
    )
    expect(provider.shutdown).toHaveBeenCalledWith(
      ownedWorktree.id,
      expect.objectContaining({ immediate: true })
    )
    expect(provider.shutdown).not.toHaveBeenCalledWith(
      unrelated.id,
      expect.objectContaining({ immediate: true })
    )
    expect(provider.shutdown).toHaveBeenCalledTimes(2)
    expect(provider.shutdown.mock.invocationCallOrder[0]).toBeLessThan(
      removeProjectForHost.mock.invocationCallOrder[0]
    )
  })

  it('keeps the project retryable when authoritative provider inventory fails', async () => {
    const { runtime, repos, provider, removeProjectForHost } = createRuntime()
    provider.listProcesses.mockRejectedValueOnce(new Error('relay unavailable'))

    await expect(runtime.removeProject('path:/remote/dup')).rejects.toThrow('relay unavailable')

    expect(removeProjectForHost).not.toHaveBeenCalled()
    expect(repos).toHaveLength(2)
  })

  it('waits for an admitted spawn and rejects later spawns during removal', async () => {
    const { runtime, provider } = createRuntime()
    const releaseSpawn = await runtime.acquireWorktreeTerminalSpawn('dup::/remote/dup')
    const removal = runtime.removeProject('path:/remote/dup')

    await Promise.resolve()
    await expect(runtime.acquireWorktreeTerminalSpawn('dup::/remote/dup')).rejects.toThrow(
      'Project removal in progress'
    )
    expect(provider.listProcesses).not.toHaveBeenCalled()

    releaseSpawn()
    await expect(removal).resolves.toEqual({ removed: true })
    expect(provider.listProcesses).toHaveBeenCalledTimes(1)
  })

  it('releases the removal fence when catalog deletion fails', async () => {
    const { runtime, repos, removeProjectForHost, provider } = createRuntime()
    removeProjectForHost.mockImplementationOnce(() => {
      throw new Error('store write failed')
    })

    await expect(runtime.removeProject('path:/remote/dup')).rejects.toThrow('store write failed')
    expect(repos).toHaveLength(2)
    await expect(runtime.removeProject('path:/remote/dup')).resolves.toEqual({ removed: true })
    expect(provider.listProcesses).toHaveBeenCalledTimes(2)
  })
})
