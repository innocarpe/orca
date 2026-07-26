import { execFile } from 'node:child_process'

export type WindowsTreeKiller = (rootPid: number) => Promise<void>

/**
 * Shared wall-clock budget for the first taskkill and an optional live-root retry.
 * Why: two full 5s timeouts (~10s) outlive mid-wait escalate budgets (#10475).
 */
export const WINDOWS_PROCESS_TREE_KILL_TIMEOUT_MS = 5_000

/** One best-effort re-issue when the first taskkill leaves the root alive (#10475). */
export const WINDOWS_PROCESS_TREE_KILL_RETRY_DELAY_MS = 150

export type TerminateWindowsProcessTreeDeps = {
  execFileImpl?: typeof execFile
  /** Injectable liveness probe; defaults to `process.kill(pid, 0)`. */
  isProcessAlive?: (pid: number) => boolean
  /** Injectable delay between a failed first kill and the retry. */
  delayMs?: (ms: number) => Promise<void>
  /** When false, skip the live-root retry (default true). */
  retryIfAlive?: boolean
}

function defaultIsProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    timer.unref?.()
  })
}

function runTaskkill(
  rootPid: number,
  execFileImpl: typeof execFile,
  timeoutMs: number
): Promise<void> {
  return new Promise((resolve) => {
    execFileImpl(
      'taskkill',
      ['/pid', String(rootPid), '/T', '/F'],
      {
        // Why: a wedged taskkill must not block killRoot forever (#10004 review).
        timeout: timeoutMs,
        windowsHide: true
      },
      () => {
        resolve()
      }
    )
  })
}

/**
 * Force-kill a Windows process and every descendant (`taskkill /T /F`).
 * Best-effort: missing/already-dead roots still resolve so callers can finish
 * their own handle cleanup via killRoot. When the first attempt leaves the root
 * alive (stubborn agent CLIs / nested shells), retries once after a short delay
 * so worktree delete is not blocked by a single missed taskkill (#10475).
 * Both attempts share one wall-clock budget so escalate cannot outlive its wait.
 */
export async function terminateWindowsProcessTree(
  rootPid: number,
  deps: TerminateWindowsProcessTreeDeps = {}
): Promise<void> {
  if (!Number.isInteger(rootPid) || rootPid <= 0) {
    return
  }
  const run = deps.execFileImpl ?? execFile
  const startedAt = Date.now()
  const budgetMs = WINDOWS_PROCESS_TREE_KILL_TIMEOUT_MS
  await runTaskkill(rootPid, run, budgetMs)
  if (deps.retryIfAlive === false) {
    return
  }
  const isAlive = deps.isProcessAlive ?? defaultIsProcessAlive
  if (!isAlive(rootPid)) {
    return
  }
  // Why: Hermes/Claude idle TUIs can ignore the first soft-adjacent ConPTY close
  // and survive a racing taskkill; a second /T /F after a brief settle catches them.
  await (deps.delayMs ?? defaultDelay)(WINDOWS_PROCESS_TREE_KILL_RETRY_DELAY_MS)
  if (!isAlive(rootPid)) {
    return
  }
  const remainingMs = budgetMs - (Date.now() - startedAt)
  if (remainingMs <= 0) {
    return
  }
  await runTaskkill(rootPid, run, remainingMs)
}
