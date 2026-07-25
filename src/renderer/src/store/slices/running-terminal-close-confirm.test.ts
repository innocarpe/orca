import { create } from 'zustand'
import { describe, expect, it, vi } from 'vitest'
import { createRunningTerminalCloseConfirmSlice } from './running-terminal-close-confirm'
import type { AppState } from '../types'

function makeStore() {
  return create<
    Pick<
      AppState,
      | 'runningTerminalCloseConfirm'
      | 'requestRunningTerminalCloseConfirm'
      | 'confirmRunningTerminalClose'
      | 'dismissRunningTerminalClose'
    >
  >()((...args) =>
    createRunningTerminalCloseConfirmSlice(
      ...(args as Parameters<typeof createRunningTerminalCloseConfirmSlice>)
    )
  )
}

describe('createRunningTerminalCloseConfirmSlice', () => {
  it('starts with no pending request', () => {
    expect(makeStore().getState().runningTerminalCloseConfirm).toBeNull()
  })

  it('stores the pending request when one is requested', () => {
    const store = makeStore()
    const onConfirm = vi.fn()

    store.getState().requestRunningTerminalCloseConfirm({ copyKind: 'command', onConfirm })

    expect(store.getState().runningTerminalCloseConfirm).toEqual({
      copyKind: 'command',
      onConfirm
    })
  })

  it('runs onConfirm and clears the request when confirmed', () => {
    const store = makeStore()
    const onConfirm = vi.fn()
    store.getState().requestRunningTerminalCloseConfirm({ copyKind: 'agent', onConfirm })

    store.getState().confirmRunningTerminalClose()

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(store.getState().runningTerminalCloseConfirm).toBeNull()
  })

  it('clears the request before running onConfirm so re-entrant closes do not loop', () => {
    const store = makeStore()
    const onConfirm = vi.fn(() => {
      expect(store.getState().runningTerminalCloseConfirm).toBeNull()
    })
    store.getState().requestRunningTerminalCloseConfirm({ copyKind: 'command', onConfirm })

    store.getState().confirmRunningTerminalClose()

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('dismisses without running onConfirm and runs onCancel', () => {
    const store = makeStore()
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    store.getState().requestRunningTerminalCloseConfirm({
      copyKind: 'command',
      onConfirm,
      onCancel
    })

    store.getState().dismissRunningTerminalClose()

    expect(onConfirm).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(store.getState().runningTerminalCloseConfirm).toBeNull()
  })

  it('queues concurrent requests and advances them in request order', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const store = makeStore()
    const firstConfirm = vi.fn()
    const secondConfirm = vi.fn()
    store.getState().requestRunningTerminalCloseConfirm({
      copyKind: 'command',
      onConfirm: firstConfirm
    })
    store.getState().requestRunningTerminalCloseConfirm({
      copyKind: 'agent',
      onConfirm: secondConfirm
    })

    expect(store.getState().runningTerminalCloseConfirm?.copyKind).toBe('command')
    store.getState().confirmRunningTerminalClose()
    expect(firstConfirm).toHaveBeenCalledTimes(1)
    expect(secondConfirm).not.toHaveBeenCalled()
    expect(store.getState().runningTerminalCloseConfirm?.copyKind).toBe('agent')

    now.mockReturnValue(1_351)
    store.getState().confirmRunningTerminalClose()
    expect(secondConfirm).toHaveBeenCalledTimes(1)
    expect(store.getState().runningTerminalCloseConfirm).toBeNull()
  })
})
