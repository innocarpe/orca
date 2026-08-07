import { describe, expect, it, vi } from 'vitest'
import { warmGitHubProjectModeRepos } from './github-project-mode-repo-warmup'

describe('GitHub project mode repo warmup', () => {
  it('loads repos when Mobile lands directly in GitHub project mode with an empty repo cache', async () => {
    const loadRepos = vi.fn(async () => [{ id: 'repo-1' }])
    const isCurrent = vi.fn(() => true)
    const setItems = vi.fn()

    await warmGitHubProjectModeRepos(0, loadRepos, isCurrent, setItems)

    expect(loadRepos).toHaveBeenCalledTimes(1)
    expect(loadRepos).toHaveBeenCalledWith(isCurrent)
    expect(setItems).toHaveBeenCalledWith([])
  })

  it('reuses cached repos before filtering project rows', async () => {
    const loadRepos = vi.fn(async () => [{ id: 'repo-1' }])
    const isCurrent = vi.fn(() => true)
    const setItems = vi.fn()

    await warmGitHubProjectModeRepos(1, loadRepos, isCurrent, setItems)

    expect(loadRepos).not.toHaveBeenCalled()
    expect(setItems).toHaveBeenCalledWith([])
  })

  it('does not update items after a newer task load starts', async () => {
    const isCurrent = vi.fn(() => false)
    const setItems = vi.fn()

    await warmGitHubProjectModeRepos(
      0,
      vi.fn(async () => []),
      isCurrent,
      setItems
    )

    expect(setItems).not.toHaveBeenCalled()
  })

  it('passes the current-load guard into loadRepos for stale-host protection', async () => {
    const isCurrent = vi.fn(() => true)
    const loadRepos = vi.fn(async (guard: () => boolean) => {
      expect(guard).toBe(isCurrent)
      return [{ id: 'repo-1' }]
    })
    await warmGitHubProjectModeRepos(0, loadRepos, isCurrent, vi.fn())
    expect(loadRepos).toHaveBeenCalledWith(isCurrent)
  })
})
