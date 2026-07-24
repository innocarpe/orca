import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getStateMock, inspectRuntimeTerminalProcessMock } = vi.hoisted(() => ({
  getStateMock: vi.fn(),
  inspectRuntimeTerminalProcessMock: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: {
    getState: getStateMock
  }
}))

vi.mock('@/runtime/runtime-terminal-inspection', () => ({
  inspectRuntimeTerminalProcess: inspectRuntimeTerminalProcessMock
}))

import {
  collectTabPtyIds,
  guardRunningTerminalClose,
  resolveTabCloseDialogCopyKind
} from './running-terminal-close-guard'
import type { AppState } from './types'

function makeState(overrides: Partial<AppState> = {}): AppState {
  return {
    settings: { skipCloseTerminalWithRunningProcessConfirm: false },
    ptyIdsByTabId: {},
    terminalLayoutsByTabId: {},
    agentStatusByPaneKey: {},
    requestRunningTerminalCloseConfirm: vi.fn(),
    ...overrides
  } as unknown as AppState
}

describe('collectTabPtyIds', () => {
  it('prefers ptyIdsByTabId when present', () => {
    expect(
      collectTabPtyIds(
        {
          ptyIdsByTabId: { 'tab-1': ['pty-a', 'pty-b'] },
          terminalLayoutsByTabId: {
            'tab-1': { ptyIdsByLeafId: { leaf: 'pty-layout' } }
          }
        } as never,
        'tab-1'
      )
    ).toEqual(['pty-a', 'pty-b'])
  })

  it('falls back to layout bindings when the map is empty', () => {
    expect(
      collectTabPtyIds(
        {
          ptyIdsByTabId: { 'tab-1': [] },
          terminalLayoutsByTabId: {
            'tab-1': { ptyIdsByLeafId: { leaf: 'pty-layout', empty: null } }
          }
        } as never,
        'tab-1'
      )
    ).toEqual(['pty-layout'])
  })
})

describe('resolveTabCloseDialogCopyKind', () => {
  it('returns agent when any pane on the tab has a known agent', () => {
    expect(
      resolveTabCloseDialogCopyKind(
        {
          agentStatusByPaneKey: {
            'tab-1:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee': { agentType: 'claude' },
            'other:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee': { agentType: 'codex' }
          }
        } as never,
        'tab-1'
      )
    ).toBe('agent')
  })

  it('returns command when no known agent is present', () => {
    expect(
      resolveTabCloseDialogCopyKind(
        {
          agentStatusByPaneKey: {
            'tab-1:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee': { agentType: 'unknown' }
          }
        } as never,
        'tab-1'
      )
    ).toBe('command')
  })
})

describe('guardRunningTerminalClose', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('closes immediately when the skip setting is on', () => {
    const onClose = vi.fn()
    const requestRunningTerminalCloseConfirm = vi.fn()
    getStateMock.mockReturnValue(
      makeState({
        settings: { skipCloseTerminalWithRunningProcessConfirm: true } as AppState['settings'],
        requestRunningTerminalCloseConfirm
      })
    )

    guardRunningTerminalClose({ tabId: 'tab-1', onClose })

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(requestRunningTerminalCloseConfirm).not.toHaveBeenCalled()
    expect(inspectRuntimeTerminalProcessMock).not.toHaveBeenCalled()
  })

  it('closes immediately when the tab has no live PTYs', () => {
    const onClose = vi.fn()
    const requestRunningTerminalCloseConfirm = vi.fn()
    getStateMock.mockReturnValue(makeState({ requestRunningTerminalCloseConfirm }))

    guardRunningTerminalClose({ tabId: 'tab-1', onClose })

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(requestRunningTerminalCloseConfirm).not.toHaveBeenCalled()
  })

  it('requests confirmation when a child process is running', async () => {
    const onClose = vi.fn()
    const onCancel = vi.fn()
    const requestRunningTerminalCloseConfirm = vi.fn()
    getStateMock.mockReturnValue(
      makeState({
        ptyIdsByTabId: { 'tab-1': ['pty-1'] },
        agentStatusByPaneKey: {
          'tab-1:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee': { agentType: 'claude' }
        },
        requestRunningTerminalCloseConfirm
      })
    )
    inspectRuntimeTerminalProcessMock.mockResolvedValue({
      foregroundProcess: 'claude',
      hasChildProcesses: true
    })

    guardRunningTerminalClose({ tabId: 'tab-1', onClose, onCancel })
    await vi.waitFor(() => expect(requestRunningTerminalCloseConfirm).toHaveBeenCalledTimes(1))

    expect(onClose).not.toHaveBeenCalled()
    expect(requestRunningTerminalCloseConfirm).toHaveBeenCalledWith({
      copyKind: 'agent',
      onConfirm: onClose,
      onCancel
    })
  })

  it('closes without confirmation when no child processes are running', async () => {
    const onClose = vi.fn()
    const requestRunningTerminalCloseConfirm = vi.fn()
    getStateMock.mockReturnValue(
      makeState({
        ptyIdsByTabId: { 'tab-1': ['pty-1'] },
        requestRunningTerminalCloseConfirm
      })
    )
    inspectRuntimeTerminalProcessMock.mockResolvedValue({
      foregroundProcess: 'zsh',
      hasChildProcesses: false
    })

    guardRunningTerminalClose({ tabId: 'tab-1', onClose })
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))

    expect(requestRunningTerminalCloseConfirm).not.toHaveBeenCalled()
  })

  it('closes when the process probe rejects', async () => {
    const onClose = vi.fn()
    const requestRunningTerminalCloseConfirm = vi.fn()
    getStateMock.mockReturnValue(
      makeState({
        ptyIdsByTabId: { 'tab-1': ['pty-1'] },
        requestRunningTerminalCloseConfirm
      })
    )
    inspectRuntimeTerminalProcessMock.mockRejectedValue(new Error('wedged'))

    guardRunningTerminalClose({ tabId: 'tab-1', onClose })
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))

    expect(requestRunningTerminalCloseConfirm).not.toHaveBeenCalled()
  })

  it('still confirms when one PTY probe fails and another has a child process', async () => {
    const onClose = vi.fn()
    const requestRunningTerminalCloseConfirm = vi.fn()
    getStateMock.mockReturnValue(
      makeState({
        ptyIdsByTabId: { 'tab-1': ['pty-wedged', 'pty-running'] },
        requestRunningTerminalCloseConfirm
      })
    )
    inspectRuntimeTerminalProcessMock.mockImplementation(async (_settings, ptyId: string) => {
      if (ptyId === 'pty-wedged') {
        throw new Error('wedged')
      }
      return { foregroundProcess: 'npm', hasChildProcesses: true }
    })

    guardRunningTerminalClose({ tabId: 'tab-1', onClose })
    await vi.waitFor(() => expect(requestRunningTerminalCloseConfirm).toHaveBeenCalledTimes(1))

    expect(onClose).not.toHaveBeenCalled()
    expect(inspectRuntimeTerminalProcessMock).toHaveBeenCalledTimes(2)
  })

  it('closes when every multi-PTY probe rejects', async () => {
    const onClose = vi.fn()
    const requestRunningTerminalCloseConfirm = vi.fn()
    getStateMock.mockReturnValue(
      makeState({
        ptyIdsByTabId: { 'tab-1': ['pty-a', 'pty-b'] },
        requestRunningTerminalCloseConfirm
      })
    )
    inspectRuntimeTerminalProcessMock.mockRejectedValue(new Error('wedged'))

    guardRunningTerminalClose({ tabId: 'tab-1', onClose })
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))

    expect(requestRunningTerminalCloseConfirm).not.toHaveBeenCalled()
    expect(inspectRuntimeTerminalProcessMock).toHaveBeenCalledTimes(2)
  })
})
