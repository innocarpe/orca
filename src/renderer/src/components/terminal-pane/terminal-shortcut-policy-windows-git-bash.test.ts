import { describe, expect, it } from 'vitest'
import {
  resolveTerminalShortcutAction,
  type TerminalShortcutEvent
} from './terminal-shortcut-policy'

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

describe('Windows Git Bash terminal-first Ctrl+W', () => {
  it('lets Git Bash own Ctrl+W only under the Windows Terminal-first boundary', () => {
    const ctrlW = event({ key: 'w', code: 'KeyW', ctrlKey: true })
    const resolveWindowsCtrlW = (args: {
      terminalFirst: boolean
      gitBash: boolean
      windows: boolean
    }) =>
      resolveTerminalShortcutAction(
        ctrlW,
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
})
