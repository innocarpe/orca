import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { activateAndRevealWorktree } from './worktree-activation'
import { makeCreatedAgentWorktree as makeWorktree } from '@/lib/worktree-activation-created-agent-test-state'

const initialAppStoreState = useAppStore.getState()

afterEach(() => {
  useAppStore.setState(initialAppStoreState, true)
})

function seedEmptyPreviouslyActivatedWorktree(
  worktree: ReturnType<typeof makeWorktree>,
  overrides: Partial<ReturnType<typeof useAppStore.getState>> = {}
): { revealWorktreeInSidebar: ReturnType<typeof vi.fn> } {
  const revealWorktreeInSidebar = vi.fn()
  useAppStore.setState({
    repos: [
      {
        id: 'repo-1',
        path: '/workspace/repo',
        displayName: 'repo',
        badgeColor: '#000000',
        addedAt: 0
      }
    ],
    worktreesByRepo: { 'repo-1': [worktree] },
    activeRepoId: 'repo-1',
    activeWorktreeId: null,
    activeView: 'terminal',
    tabsByWorktree: {},
    unifiedTabsByWorktree: {},
    groupsByWorktree: {},
    layoutByWorktree: {},
    activeGroupIdByWorktree: {},
    openFiles: [],
    browserTabsByWorktree: {},
    activeFileIdByWorktree: {},
    activeBrowserTabIdByWorktree: {},
    activeTabTypeByWorktree: {},
    activeTabIdByWorktree: {},
    tabBarOrderByWorktree: {},
    pendingStartupByTabId: {},
    everActivatedWorktreeIds: new Set([worktree.id]),
    settings: {
      agentCmdOverrides: {},
      setupScriptLaunchMode: 'new-tab'
    } as unknown as ReturnType<typeof useAppStore.getState>['settings'],
    markWorktreeVisited: vi.fn(),
    recordWorktreeVisit: vi.fn(),
    refreshGitHubForWorktreeIfStale: vi.fn(),
    revealWorktreeInSidebar,
    ...overrides
  })
  return { revealWorktreeInSidebar }
}

describe('activateAndRevealWorktree empty reselect (#11108)', () => {
  it('does not auto-create a terminal or relaunch the creation agent when reselecting an emptied workspace', () => {
    const worktree = makeWorktree()
    const createTab = vi.fn(() => ({ id: 'should-not-create' }))
    const { revealWorktreeInSidebar } = seedEmptyPreviouslyActivatedWorktree(worktree, {
      createTab
    } as never)

    const result = activateAndRevealWorktree(worktree.id)
    const state = useAppStore.getState()

    expect(result).toEqual({ primaryTabId: null })
    expect(createTab).not.toHaveBeenCalled()
    expect(state.tabsByWorktree[worktree.id] ?? []).toEqual([])
    expect(state.pendingStartupByTabId).toEqual({})
    expect(state.activeWorktreeId).toBe(worktree.id)
    expect(revealWorktreeInSidebar).toHaveBeenCalledWith(worktree.id)
  })

  it('still seeds a terminal for explicit create-flow startup when reselecting an emptied workspace', () => {
    const worktree = makeWorktree()
    const { revealWorktreeInSidebar } = seedEmptyPreviouslyActivatedWorktree(worktree)

    const result = activateAndRevealWorktree(worktree.id, {
      startup: {
        command: 'echo create-flow',
        launchAgent: 'codex',
        telemetry: {
          agent_kind: 'codex',
          launch_source: 'composer',
          request_kind: 'new'
        }
      }
    })
    const state = useAppStore.getState()
    const seededTab = state.tabsByWorktree[worktree.id]?.[0]

    expect(result).toEqual({ primaryTabId: seededTab?.id })
    expect(seededTab).toBeDefined()
    expect(state.pendingStartupByTabId[seededTab!.id]?.command).toBe('echo create-flow')
    expect(revealWorktreeInSidebar).toHaveBeenCalledWith(worktree.id)
  })
})
