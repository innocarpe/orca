import { inspectRuntimeTerminalProcess } from '@/runtime/runtime-terminal-inspection'
import { useAppStore } from '@/store'
import type { AppState } from './types'
import type { RunningTerminalCloseDialogCopyKind } from './slices/running-terminal-close-confirm'

/** Live PTY ids owned by a terminal tab (store map, with layout fallback). */
export function collectTabPtyIds(
  state: Pick<AppState, 'ptyIdsByTabId' | 'terminalLayoutsByTabId'>,
  tabId: string
): string[] {
  const fromMap = state.ptyIdsByTabId?.[tabId] ?? []
  if (fromMap.length > 0) {
    return fromMap
  }
  const layout = state.terminalLayoutsByTabId?.[tabId]
  const fromLayout = Object.values(layout?.ptyIdsByLeafId ?? {}).filter(
    (ptyId): ptyId is string => typeof ptyId === 'string' && ptyId.length > 0
  )
  return fromLayout
}

/** Agent copy when any pane on the tab has a known agent type. */
export function resolveTabCloseDialogCopyKind(
  state: Pick<AppState, 'agentStatusByPaneKey'>,
  tabId: string
): RunningTerminalCloseDialogCopyKind {
  const prefix = `${tabId}:`
  for (const [paneKey, status] of Object.entries(state.agentStatusByPaneKey ?? {})) {
    if (!paneKey.startsWith(prefix)) {
      continue
    }
    if (status?.agentType && status.agentType !== 'unknown') {
      return 'agent'
    }
  }
  return 'command'
}

/**
 * Routes a tab close through the running-process confirmation when any child
 * process is still live. Idle tabs (and the "don't ask again" setting) close
 * immediately. Async inspect failures close rather than strand the tab.
 */
export function guardRunningTerminalClose(params: {
  tabId: string
  onClose: () => void
  onCancel?: () => void
}): void {
  const { tabId, onClose, onCancel } = params
  const state = useAppStore.getState()
  if (state.settings?.skipCloseTerminalWithRunningProcessConfirm) {
    onClose()
    return
  }

  const ptyIds = collectTabPtyIds(state, tabId)
  if (ptyIds.length === 0) {
    onClose()
    return
  }

  const settings = state.settings
  void Promise.all(ptyIds.map((ptyId) => inspectRuntimeTerminalProcess(settings, ptyId)))
    .then((inspections) => {
      if (!inspections.some((process) => process.hasChildProcesses)) {
        onClose()
        return
      }
      const latest = useAppStore.getState()
      if (latest.settings?.skipCloseTerminalWithRunningProcessConfirm) {
        onClose()
        return
      }
      latest.requestRunningTerminalCloseConfirm({
        copyKind: resolveTabCloseDialogCopyKind(latest, tabId),
        onConfirm: onClose,
        ...(onCancel ? { onCancel } : {})
      })
    })
    // Why: wedged IPC / legacy providers must not leave Cmd+W / X unresponsive.
    .catch(() => {
      onClose()
    })
}
