import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import type { FolderWorkspace, ProjectGroup } from '../../../shared/types'
import { folderWorkspaceKey } from '../../../shared/workspace-scope'
import { makeCreatedAgentWorktree as makeWorktree } from '@/lib/worktree-activation-created-agent-test-state'

const resumeSleepingMock = vi.hoisted(() => vi.fn(() => 0))

vi.mock('@/lib/resume-sleeping-agent-session', () => ({
  resumeSleepingAgentSessionsForWorktree: resumeSleepingMock
}))

const { activateAndRevealFolderWorkspace, activateAndRevealWorktree } =
  await import('./worktree-activation')

const initialAppStoreState = useAppStore.getState()

afterEach(() => {
  useAppStore.setState(initialAppStoreState, true)
  resumeSleepingMock.mockClear()
})

beforeEach(() => {
  resumeSleepingMock.mockClear()
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

const projectGroup: ProjectGroup = {
  id: 'group-1',
  name: 'Platform',
  parentPath: null,
  parentGroupId: null,
  createdFrom: 'manual',
  tabOrder: 0,
  isCollapsed: false,
  color: null,
  createdAt: 1,
  updatedAt: 1
}

const folderWorkspace: FolderWorkspace = {
  id: 'folder-workspace-1',
  projectGroupId: projectGroup.id,
  name: 'Notes folder',
  folderPath: '/workspace/notes',
  linkedTask: null,
  comment: '',
  isArchived: false,
  isUnread: false,
  isPinned: false,
  sortOrder: 1,
  lastActivityAt: 0,
  createdAt: 1,
  updatedAt: 1
}

function seedEmptyPreviouslyActivatedFolderWorkspace(
  overrides: Partial<ReturnType<typeof useAppStore.getState>> = {}
): {
  revealWorktreeInSidebar: ReturnType<typeof vi.fn>
  workspaceKey: string
} {
  const revealWorktreeInSidebar = vi.fn()
  const workspaceKey = folderWorkspaceKey(folderWorkspace.id)
  useAppStore.setState({
    projectGroups: [projectGroup],
    folderWorkspaces: [folderWorkspace],
    activeWorktreeId: null,
    activeWorkspaceKey: null,
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
    // Why: previously activated + empty tabs is the empty-reselect policy under test.
    everActivatedWorktreeIds: new Set([workspaceKey]),
    settings: {
      agentCmdOverrides: {},
      setupScriptLaunchMode: 'new-tab'
    } as unknown as ReturnType<typeof useAppStore.getState>['settings'],
    markWorktreeVisited: vi.fn(),
    recordWorktreeVisit: vi.fn(),
    // Why: null does not block activation (only confirmed stale / ambiguous).
    getFreshFolderWorkspacePathStatus: vi.fn(() => null),
    setActiveFolderWorkspace: vi.fn((id: string) => {
      useAppStore.setState({
        activeWorkspaceKey: folderWorkspaceKey(id),
        activeWorktreeId: null
      })
    }),
    revealWorktreeInSidebar,
    ...overrides
  })
  return { revealWorktreeInSidebar, workspaceKey }
}

describe('activateAndRevealWorktree empty reselect (#11108 / #11159)', () => {
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
    // Why: empty reselect must not wake sleeping agents into a terminal-less workspace.
    expect(resumeSleepingMock).not.toHaveBeenCalled()
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
          launch_source: 'new_workspace_composer',
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
    expect(resumeSleepingMock).toHaveBeenCalledWith(worktree.id)
  })
})

describe('activateAndRevealFolderWorkspace empty reselect (#11159)', () => {
  it('does not seed a terminal or resume sleeping agents when reselecting an emptied folder workspace', () => {
    const createTab = vi.fn(() => ({ id: 'should-not-create' }))
    const { revealWorktreeInSidebar, workspaceKey } = seedEmptyPreviouslyActivatedFolderWorkspace({
      createTab
    } as never)

    const result = activateAndRevealFolderWorkspace(folderWorkspace.id)
    const state = useAppStore.getState()

    expect(result).toEqual({ primaryTabId: null })
    expect(createTab).not.toHaveBeenCalled()
    expect(state.tabsByWorktree[workspaceKey] ?? []).toEqual([])
    expect(state.pendingStartupByTabId).toEqual({})
    expect(revealWorktreeInSidebar).toHaveBeenCalledWith(workspaceKey)
    expect(resumeSleepingMock).not.toHaveBeenCalled()
  })

  it('still seeds a terminal and may resume sleeping agents when startup is explicit', () => {
    const { revealWorktreeInSidebar, workspaceKey } = seedEmptyPreviouslyActivatedFolderWorkspace()

    const result = activateAndRevealFolderWorkspace(folderWorkspace.id, {
      startup: {
        command: 'echo folder-create-flow',
        launchAgent: 'codex',
        telemetry: {
          agent_kind: 'codex',
          launch_source: 'new_workspace_composer',
          request_kind: 'new'
        }
      }
    })
    const state = useAppStore.getState()
    const seededTab = state.tabsByWorktree[workspaceKey]?.[0]

    expect(result).toEqual({ primaryTabId: seededTab?.id })
    expect(seededTab).toBeDefined()
    expect(state.pendingStartupByTabId[seededTab!.id]?.command).toBe('echo folder-create-flow')
    expect(revealWorktreeInSidebar).toHaveBeenCalledWith(workspaceKey)
    expect(resumeSleepingMock).toHaveBeenCalledWith(workspaceKey)
  })

  it('seeds on first folder activation when never activated before', () => {
    const { revealWorktreeInSidebar, workspaceKey } = seedEmptyPreviouslyActivatedFolderWorkspace({
      everActivatedWorktreeIds: new Set()
    })

    const result = activateAndRevealFolderWorkspace(folderWorkspace.id)
    const state = useAppStore.getState()
    const seededTab = state.tabsByWorktree[workspaceKey]?.[0]

    expect(result).toEqual({ primaryTabId: seededTab?.id })
    expect(seededTab).toBeDefined()
    expect(revealWorktreeInSidebar).toHaveBeenCalledWith(workspaceKey)
    expect(resumeSleepingMock).toHaveBeenCalledWith(workspaceKey)
  })
})
