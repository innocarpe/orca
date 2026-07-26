import { describe, expect, it, vi } from 'vitest'
import {
  terminateWindowsProcessTree,
  WINDOWS_PROCESS_TREE_KILL_RETRY_DELAY_MS,
  WINDOWS_PROCESS_TREE_KILL_TIMEOUT_MS
} from './windows-process-tree-kill'

describe('terminateWindowsProcessTree', () => {
  it('invokes taskkill /T /F with timeout and windowsHide', async () => {
    const execFileImpl = vi.fn(
      (
        _cmd: string,
        _args: readonly string[],
        _options: { timeout?: number; windowsHide?: boolean },
        callback: (error: Error | null) => void
      ) => {
        callback(null)
      }
    )
    await terminateWindowsProcessTree(1234, {
      execFileImpl: execFileImpl as never,
      isProcessAlive: () => false
    })
    expect(execFileImpl).toHaveBeenCalledWith(
      'taskkill',
      ['/pid', '1234', '/T', '/F'],
      {
        timeout: WINDOWS_PROCESS_TREE_KILL_TIMEOUT_MS,
        windowsHide: true
      },
      expect.any(Function)
    )
    expect(execFileImpl).toHaveBeenCalledTimes(1)
  })

  it('resolves even when taskkill reports failure (already dead)', async () => {
    const execFileImpl = vi.fn(
      (
        _cmd: string,
        _args: readonly string[],
        _options: { timeout?: number; windowsHide?: boolean },
        callback: (error: Error | null) => void
      ) => {
        callback(new Error('not found'))
      }
    )
    await expect(
      terminateWindowsProcessTree(55, {
        execFileImpl: execFileImpl as never,
        isProcessAlive: () => false
      })
    ).resolves.toBeUndefined()
  })

  it('retries taskkill once when the root is still alive after the first attempt (#10475)', async () => {
    const execFileImpl = vi.fn(
      (
        _cmd: string,
        _args: readonly string[],
        _options: { timeout?: number; windowsHide?: boolean },
        callback: (error: Error | null) => void
      ) => {
        callback(null)
      }
    )
    let aliveChecks = 0
    const delayMs = vi.fn(async () => {})
    await terminateWindowsProcessTree(4242, {
      execFileImpl: execFileImpl as never,
      isProcessAlive: () => {
        aliveChecks += 1
        // First post-kill check + post-delay check both see a live root.
        return true
      },
      delayMs
    })
    expect(execFileImpl).toHaveBeenCalledTimes(2)
    expect(delayMs).toHaveBeenCalledWith(WINDOWS_PROCESS_TREE_KILL_RETRY_DELAY_MS)
    expect(aliveChecks).toBe(2)
  })

  it('does not retry when the root dies during the settle delay', async () => {
    const execFileImpl = vi.fn(
      (
        _cmd: string,
        _args: readonly string[],
        _options: { timeout?: number; windowsHide?: boolean },
        callback: (error: Error | null) => void
      ) => {
        callback(null)
      }
    )
    let alive = true
    await terminateWindowsProcessTree(77, {
      execFileImpl: execFileImpl as never,
      isProcessAlive: () => alive,
      delayMs: async () => {
        alive = false
      }
    })
    expect(execFileImpl).toHaveBeenCalledTimes(1)
  })

  it('skips the live-root retry when retryIfAlive is false', async () => {
    const execFileImpl = vi.fn(
      (
        _cmd: string,
        _args: readonly string[],
        _options: { timeout?: number; windowsHide?: boolean },
        callback: (error: Error | null) => void
      ) => {
        callback(null)
      }
    )
    await terminateWindowsProcessTree(88, {
      execFileImpl: execFileImpl as never,
      retryIfAlive: false,
      isProcessAlive: () => true
    })
    expect(execFileImpl).toHaveBeenCalledTimes(1)
  })

  it('skips taskkill for invalid pids', async () => {
    const execFileImpl = vi.fn()
    await terminateWindowsProcessTree(0, { execFileImpl: execFileImpl as never })
    await terminateWindowsProcessTree(-1, { execFileImpl: execFileImpl as never })
    expect(execFileImpl).not.toHaveBeenCalled()
  })
})
