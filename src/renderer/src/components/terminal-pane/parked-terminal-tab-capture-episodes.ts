import { useAppStore } from '../../store'
import {
  captureParkedTerminalBuffers,
  enqueueParkedTerminalCapture,
  whenParkedCaptureSettles
} from './parked-terminal-buffer-capture'
import { haveSameTerminalTabIds } from './use-terminal-park-verdict-pin'

const capturedTabIdsByWorktree = new Map<string, Set<string>>()

/** Serialize each newly parked tab's panes while they are still mounted, once per park episode.
 *  Why here rather than at unmount: a remote-runtime tab's xterm is the only client-side copy of
 *  its scrollback. `capturedTabIds` is mutated in place: it is the caller's ref-held episode ledger.
 *  Returns a Promise only when a registered remote pane still has to yield. */
export function captureNewlyParkedTerminalTabs(
  worktreeId: string,
  parkedTabIds: ReadonlySet<string>,
  capturedTabIds: Set<string>
): void | Promise<void> {
  for (const tabId of Array.from(capturedTabIds)) {
    if (!parkedTabIds.has(tabId)) {
      capturedTabIds.delete(tabId)
    }
  }
  if (capturedTabIds.size === parkedTabIds.size) {
    return
  }
  // Why the fallback: capture is best-effort evidence and must never throw out of the park pass.
  // An unhydrated catalog fails open toward "remote" in shouldPreserveTerminalScrollbackBuffers.
  const repos = useAppStore.getState().repos ?? []
  const pending: Promise<unknown>[] = []
  for (const tabId of parkedTabIds) {
    if (capturedTabIds.has(tabId)) {
      continue
    }
    // Why one tab per call: coverage is reported for the whole batch, and a tab mid-remount must
    // stay unmarked so the next pass retries it instead of parking it uncaptured.
    enqueueParkedTerminalCapture(
      captureParkedTerminalBuffers({
        worktreeId,
        tabIds: [tabId],
        repos
      }),
      () => {
        capturedTabIds.add(tabId)
      },
      pending
    )
  }
  if (pending.length === 0) {
    return
  }
  return Promise.all(pending).then(() => undefined)
}

export function scheduleNewlyParkedTerminalTabCapture(
  worktreeId: string,
  parkedTabIds: ReadonlySet<string>,
  parkedTabIdsRef: { current: ReadonlySet<string> },
  setParkedTabIds: (ids: ReadonlySet<string>) => void
): void {
  let capturedTabIds = capturedTabIdsByWorktree.get(worktreeId)
  if (!capturedTabIds) {
    capturedTabIds = new Set()
    capturedTabIdsByWorktree.set(worktreeId, capturedTabIds)
  }
  whenParkedCaptureSettles(
    captureNewlyParkedTerminalTabs(worktreeId, parkedTabIds, capturedTabIds),
    () => {
      if (!haveSameTerminalTabIds(parkedTabIdsRef.current, parkedTabIds)) {
        parkedTabIdsRef.current = parkedTabIds
        setParkedTabIds(parkedTabIds)
      }
    }
  )
}
