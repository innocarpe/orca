import { describe, expect, it } from 'vitest'
import type { AppState } from '@/store'
import { isWindowsGitBashPaneForShortcut } from './keyboard-handlers'
import {
  resolveTerminalShortcutAction,
  type TerminalShortcutEvent
} from './terminal-shortcut-policy'

const WORKTREE_ID = 'repo::C:\\repo'
const TAB_ID = 'tab-1'

function event(overrides: Partial<TerminalShortcutEvent>): TerminalShortcutEvent {
  return {
    key: '',
    code: '',
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    ...overrides
  }
}

function shortcutState(args: {
  tabShellOverride?: string
  terminalWindowsShell?: string
}): Pick<AppState, 'tabsByWorktree' | 'settings'> {
  const tabsByWorktree = {
    [WORKTREE_ID]: [
      {
        id: TAB_ID,
        ...(args.tabShellOverride ? { shellOverride: args.tabShellOverride } : {})
      }
    ]
  } as unknown as AppState['tabsByWorktree']
  return {
    tabsByWorktree,
    settings: {
      terminalWindowsShell: args.terminalWindowsShell
    } as AppState['settings']
  }
}

describe('Windows Git Bash terminal-first Ctrl+W', () => {
  const ctrlW = event({ key: 'w', code: 'KeyW', ctrlKey: true })
  const resolveWindowsCtrlW = (args: {
    terminalFirst: boolean
    gitBash: boolean
    windows: boolean
    input?: TerminalShortcutEvent
  }) =>
    resolveTerminalShortcutAction(
      args.input ?? ctrlW,
      false,
      'false',
      0,
      args.windows,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      () => args.windows,
      args.terminalFirst ? 'terminal-first' : 'orca-first',
      undefined,
      () => args.gitBash
    )

  it('lets Git Bash own Ctrl+W only under the Windows Terminal-first boundary', () => {
    expect(resolveWindowsCtrlW({ terminalFirst: true, gitBash: true, windows: true })).toBeNull()
    expect(resolveWindowsCtrlW({ terminalFirst: false, gitBash: true, windows: true })).toEqual({
      type: 'closeActivePane'
    })
    expect(resolveWindowsCtrlW({ terminalFirst: true, gitBash: false, windows: true })).toEqual({
      type: 'closeActivePane'
    })
    expect(resolveWindowsCtrlW({ terminalFirst: true, gitBash: true, windows: false })).toEqual({
      type: 'closeActivePane'
    })
  })

  it('keeps mismatched logical w events on the pane-close path', () => {
    expect(
      resolveWindowsCtrlW({
        terminalFirst: true,
        gitBash: true,
        windows: true,
        input: event({ key: 'w', code: 'KeyQ', ctrlKey: true })
      })
    ).toEqual({
      type: 'closeActivePane'
    })
  })

  it('detects Git Bash from active-pane session metadata', () => {
    expect(
      isWindowsGitBashPaneForShortcut({
        isWindowsTerminalHost: true,
        state: shortcutState({
          tabShellOverride: 'powershell.exe',
          terminalWindowsShell: 'cmd.exe'
        }),
        worktreeId: WORKTREE_ID,
        tabId: TAB_ID,
        sessionShellOverride: 'git-bash'
      })
    ).toBe(true)
  })

  it('keeps non-Git-Bash Windows shells and non-Windows hosts on the close path', () => {
    const state = shortcutState({
      tabShellOverride: 'cmd.exe',
      terminalWindowsShell: 'git-bash'
    })

    expect(
      isWindowsGitBashPaneForShortcut({
        isWindowsTerminalHost: true,
        state,
        worktreeId: WORKTREE_ID,
        tabId: TAB_ID,
        sessionShellOverride: 'powershell.exe'
      })
    ).toBe(false)
    expect(
      isWindowsGitBashPaneForShortcut({
        isWindowsTerminalHost: false,
        state: shortcutState({ tabShellOverride: 'git-bash' }),
        worktreeId: WORKTREE_ID,
        tabId: TAB_ID
      })
    ).toBe(false)
  })

  it('falls back to the global Windows shell when no pane or tab shell is set', () => {
    expect(
      isWindowsGitBashPaneForShortcut({
        isWindowsTerminalHost: true,
        state: shortcutState({ terminalWindowsShell: 'git-bash' }),
        worktreeId: WORKTREE_ID,
        tabId: TAB_ID
      })
    ).toBe(true)
  })
})
