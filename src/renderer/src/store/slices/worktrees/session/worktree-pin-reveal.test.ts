import { describe, expect, it, vi } from 'vitest'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { createSetWorktreesPinnedAndReveal } from './worktree-pin-reveal'

function worktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    id: 'repo::/feature',
    repoId: 'repo',
    displayName: 'Feature',
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    path: '/feature',
    head: 'head',
    branch: 'feature',
    isBare: false,
    isMainWorktree: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0,
    ...overrides
  }
}

function sliceState(worktrees: Worktree[]) {
  const state = {
    activeWorktreeId: null,
    activeWorkspaceExecutionHostId: null,
    activeWorkspaceKey: null,
    worktreeLineageById: {},
    settings: { showPinnedWorktreesInGroups: true },
    updateWorktreeMeta: vi.fn(),
    updateWorktreesMeta: vi.fn(),
    revealWorktreeInSidebar: vi.fn(),
    getKnownWorktreeById: (worktreeId: string, executionHostId?: string) =>
      worktrees.find(
        (candidate) =>
          candidate.id === worktreeId &&
          (executionHostId === undefined || (candidate.hostId ?? 'local') === executionHostId)
      )
  }
  return { state, get: () => state }
}

describe('setWorktreesPinnedAndReveal', () => {
  it('writes to the host named by a qualified target, not the first id match', () => {
    const local = worktree({ hostId: 'local' })
    const remote = worktree({ hostId: 'ssh:build' })
    const { state, get } = sliceState([local, remote])

    createSetWorktreesPinnedAndReveal(get)(
      [{ worktreeId: remote.id, executionHostId: 'ssh:build' }],
      true
    )

    expect(state.updateWorktreesMeta).toHaveBeenCalledWith([
      {
        worktreeId: remote.id,
        updates: { isPinned: true },
        executionHostId: 'ssh:build'
      }
    ])
    expect(state.updateWorktreeMeta).not.toHaveBeenCalled()
  })
})
