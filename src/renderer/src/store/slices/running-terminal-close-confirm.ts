import type { StateCreator } from 'zustand'
import type { AppState } from '../types'

export type RunningTerminalCloseDialogCopyKind = 'command' | 'agent'

/** Pending confirmation before killing a tab that still has a child process. */
export type RunningTerminalCloseConfirmRequest = {
  copyKind: RunningTerminalCloseDialogCopyKind
  onConfirm: () => void
  onCancel?: () => void
}

export type RunningTerminalCloseConfirmSlice = {
  runningTerminalCloseConfirm: RunningTerminalCloseConfirmRequest | null
  requestRunningTerminalCloseConfirm: (request: RunningTerminalCloseConfirmRequest) => void
  confirmRunningTerminalClose: () => void
  dismissRunningTerminalClose: () => void
}

export const createRunningTerminalCloseConfirmSlice: StateCreator<
  AppState,
  [],
  [],
  RunningTerminalCloseConfirmSlice
> = (set, get) => {
  const queuedRequests: RunningTerminalCloseConfirmRequest[] = []
  let nextRequestActionAllowedAt = 0
  const INTER_REQUEST_ACTION_GUARD_MS = 350

  const advanceRequest = (): boolean => {
    const next = queuedRequests.shift() ?? null
    set({ runningTerminalCloseConfirm: next })
    return next !== null
  }

  return {
    runningTerminalCloseConfirm: null,

    requestRunningTerminalCloseConfirm: (request) => {
      if (get().runningTerminalCloseConfirm) {
        // Why: bulk/rapid closes can request multiple confirmations; queue so a
        // replacement cannot strand an earlier tab's cleanup callbacks.
        queuedRequests.push(request)
        return
      }
      set({ runningTerminalCloseConfirm: request })
    },

    confirmRunningTerminalClose: () => {
      if (Date.now() < nextRequestActionAllowedAt) {
        return
      }
      const request = get().runningTerminalCloseConfirm
      if (!request) {
        return
      }
      // Why: advance before onConfirm so re-entrant closes queue behind the next
      // real request instead of seeing the stale one.
      if (advanceRequest()) {
        nextRequestActionAllowedAt = Date.now() + INTER_REQUEST_ACTION_GUARD_MS
      }
      request.onConfirm()
    },

    dismissRunningTerminalClose: () => {
      if (Date.now() < nextRequestActionAllowedAt) {
        return
      }
      const request = get().runningTerminalCloseConfirm
      if (!request) {
        return
      }
      if (advanceRequest()) {
        nextRequestActionAllowedAt = Date.now() + INTER_REQUEST_ACTION_GUARD_MS
      }
      request.onCancel?.()
    }
  }
}
