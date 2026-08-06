// @vitest-environment happy-dom

import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../shared/types'
import { useAppStore } from '@/store'
import { useRepoSlugIndex } from './repo-slug-index'
import { clearRepoSlugCacheValues } from './repo-slug-cache'

const repoSlug = vi.fn()

function makeRepo(overrides: Partial<Repo> & { id: string }): Repo {
  return {
    path: `/repos/${overrides.id}`,
    displayName: overrides.id,
    badgeColor: '#000',
    addedAt: 1,
    executionHostId: 'local',
    ...overrides
  }
}

const initialState = useAppStore.getInitialState()

function setRepos(repos: Repo[]): void {
  useAppStore.setState({ ...initialState, repos, settings: initialState.settings }, true)
}

beforeEach(() => {
  clearRepoSlugCacheValues()
  repoSlug.mockReset()
  // Why: origin resolution goes through the preload bridge; the index under
  // test only reads `repo.upstream` from the store for the fork alias.
  Object.assign(window, { api: { gh: { repoSlug } } })
})

afterEach(() => setRepos([]))

async function lookup(slug: string): Promise<Repo[]> {
  const { result } = renderHook(() => useRepoSlugIndex())
  await waitFor(() => expect(result.current.ready).toBe(true))
  return [...result.current.lookupSlug(slug)]
}

describe('useRepoSlugIndex fork upstream matching', () => {
  it('matches a project row against a fork clone via its upstream parent', async () => {
    const fork = makeRepo({ id: 'fork', upstream: { owner: 'SciPhi-AI', repo: 'R2R' } })
    setRepos([fork])
    repoSlug.mockResolvedValue({ owner: 'me', repo: 'r2r-mirror' })

    expect(await lookup('SciPhi-AI/R2R')).toEqual([fork])
  })

  it('still matches the fork by its own origin slug', async () => {
    const fork = makeRepo({ id: 'fork', upstream: { owner: 'SciPhi-AI', repo: 'R2R' } })
    setRepos([fork])
    repoSlug.mockResolvedValue({ owner: 'me', repo: 'r2r-mirror' })

    expect(await lookup('me/r2r-mirror')).toEqual([fork])
  })

  it('prefers the clone that owns the slug over a fork of it', async () => {
    const upstreamClone = makeRepo({ id: 'upstream', upstream: null })
    const fork = makeRepo({ id: 'fork', upstream: { owner: 'SciPhi-AI', repo: 'R2R' } })
    setRepos([upstreamClone, fork])
    repoSlug.mockImplementation(async (args: { repoId?: string }) =>
      args.repoId === 'upstream'
        ? { owner: 'SciPhi-AI', repo: 'R2R' }
        : { owner: 'me', repo: 'r2r-mirror' }
    )

    expect(await lookup('SciPhi-AI/R2R')).toEqual([upstreamClone])
  })

  it('does not bind a github.com fork parent to a same-named Enterprise row', async () => {
    const fork = makeRepo({ id: 'fork', upstream: { owner: 'SciPhi-AI', repo: 'R2R' } })
    setRepos([fork])
    repoSlug.mockResolvedValue({ owner: 'me', repo: 'r2r-mirror' })

    const { result } = renderHook(() => useRepoSlugIndex())
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.lookupSlug('SciPhi-AI/R2R', 'ghe.example')).toEqual([])
  })

  it('resolves the slug index without extra upstream IPC', async () => {
    const fork = makeRepo({ id: 'fork', upstream: { owner: 'SciPhi-AI', repo: 'R2R' } })
    setRepos([fork])
    repoSlug.mockResolvedValue({ owner: 'me', repo: 'r2r-mirror' })

    expect(await lookup('SciPhi-AI/R2R')).toEqual([fork])
    expect(repoSlug).toHaveBeenCalledTimes(1)
  })

  // Why: persistence strips `upstream.host`, so the fork's own origin host is the
  // only evidence of which server its parent lives on.
  it('scopes a host-less fork parent to the host the fork itself was cloned from', async () => {
    const fork = makeRepo({ id: 'fork', upstream: { owner: 'acme', repo: 'widgets' } })
    setRepos([fork])
    repoSlug.mockResolvedValue({ owner: 'me', repo: 'widgets', host: 'ghe.example' })

    const { result } = renderHook(() => useRepoSlugIndex())
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.lookupSlug('acme/widgets', 'ghe.example')).toEqual([fork])
    expect(result.current.lookupSlug('acme/widgets')).toEqual([])
  })

  it('reports origin and upstream matches separately for selection filtering', async () => {
    const upstreamClone = makeRepo({ id: 'upstream', upstream: null })
    const fork = makeRepo({ id: 'fork', upstream: { owner: 'SciPhi-AI', repo: 'R2R' } })
    setRepos([upstreamClone, fork])
    repoSlug.mockImplementation(async (args: { repoId?: string }) =>
      args.repoId === 'upstream'
        ? { owner: 'SciPhi-AI', repo: 'R2R' }
        : { owner: 'me', repo: 'r2r-mirror' }
    )

    const { result } = renderHook(() => useRepoSlugIndex())
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.lookupSlugMatches('SciPhi-AI/R2R')).toEqual({
      origin: [upstreamClone],
      upstream: [fork]
    })
  })
})
