import {
  shouldPreserveTerminalScrollbackBuffers,
  type RepoConnection
} from '../../../../shared/workspace-session-terminal-buffers'
import {
  captureTerminalShutdownBuffersBestEffort,
  shutdownBufferCaptures
} from './shutdown-buffer-captures'

type ParkedTerminalCaptureArgs = {
  worktreeId: string
  tabIds: readonly string[]
  repos: readonly RepoConnection[]
}

function isThenable(value: unknown): value is Promise<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  )
}

/** Serialize a parked worktree's panes before the park unmounts them.
 *  Why every park and not only force-park: a remote-runtime pane's bytes never transit main, so its
 *  xterm buffer is the only client-side copy. Local worktrees stay exempt — includeLocalBuffers:false
 *  serializes nothing for them. Returns whether the episode covered every tab; false leaves it
 *  unmarked so a later episode retries. A Promise means at least one pane still has to yield. */
export function captureParkedTerminalBuffers({
  worktreeId,
  tabIds,
  repos
}: ParkedTerminalCaptureArgs): boolean | Promise<boolean> {
  // Why skip local worktrees: includeLocalBuffers:false serializes nothing for them, so the only
  // effect left is setTabLayout replacing away a stored buffer (e.g. an exited setup pane's output).
  if (!shouldPreserveTerminalScrollbackBuffers(worktreeId, repos)) {
    return true
  }
  if (tabIds.length === 0) {
    return true
  }
  if (!tabIds.some((tabId) => shutdownBufferCaptures.has(tabId))) {
    return false
  }
  return captureTerminalShutdownBuffersBestEffort(tabIds, {
    includeLocalBuffers: false,
    yieldBetweenPanes: true
  }).then((result) => result.captured === result.requested)
}

export function whenParkedCaptureSettles(result: unknown, onComplete: () => void): void {
  if (isThenable(result)) {
    void result.then(onComplete, onComplete)
    return
  }
  onComplete()
}

export function enqueueParkedTerminalCapture(
  result: boolean | Promise<boolean>,
  onOk: () => void,
  pending: Promise<unknown>[]
): void {
  if (isThenable(result)) {
    pending.push(
      result.then((ok) => {
        if (ok) {
          onOk()
        }
      })
    )
    return
  }
  if (result) {
    onOk()
  }
}
