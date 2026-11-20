import { isPairedWebClientWindow } from '@/app-shell/chrome/desktop-window-chrome'
import { getPairedWebClientEnvironmentId } from '@/app-shell/platform/paired-web-client-host'
import { selectExecutionHostDisplayLabel } from '@/runtime/hosts/display/execution-host-display-label'
import { useAppStore } from '@/store'
import {
  LOCAL_EXECUTION_HOST_ID,
  toRuntimeExecutionHostId,
  type ExecutionHostId
} from '../../../../shared/execution-host/execution-host'

/**
 * The paired server a bot runs on, by its name in Settings; null for this computer's own bots, and
 * in a paired web window, whose bots are all on its one server.
 */
export function useBotHostLabel(hostId: ExecutionHostId): string | null {
  return useAppStore((state) =>
    hostId === LOCAL_EXECUTION_HOST_ID || isPairedWebClientWindow()
      ? null
      : selectExecutionHostDisplayLabel(state, hostId)
  )
}

/** The one server a paired web window is signed into. Null on the desktop, where host labels stay as they are. */
export function usePairedWebServerLabel(): string | null {
  return useAppStore((state) => {
    const environmentId = getPairedWebClientEnvironmentId(state)
    if (!environmentId) {
      return null
    }
    const label = selectExecutionHostDisplayLabel(
      state,
      toRuntimeExecutionHostId(environmentId)
    ).trim()
    return label || null
  })
}
