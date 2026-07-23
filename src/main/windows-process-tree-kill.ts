import { execFile } from 'node:child_process'

export type WindowsTreeKiller = (rootPid: number) => Promise<void>

/**
 * Force-kill a Windows process and every descendant (`taskkill /T /F`).
 * Best-effort: missing/already-dead roots still resolve so callers can finish
 * their own handle cleanup via killRoot.
 */
export function terminateWindowsProcessTree(
  rootPid: number,
  deps: { execFileImpl?: typeof execFile } = {}
): Promise<void> {
  if (!Number.isInteger(rootPid) || rootPid <= 0) {
    return Promise.resolve()
  }
  const run = deps.execFileImpl ?? execFile
  return new Promise((resolve) => {
    run('taskkill', ['/pid', String(rootPid), '/T', '/F'], () => {
      resolve()
    })
  })
}
