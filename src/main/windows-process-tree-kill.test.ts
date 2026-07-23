import { describe, expect, it, vi } from 'vitest'
import { terminateWindowsProcessTree } from './windows-process-tree-kill'

describe('terminateWindowsProcessTree', () => {
  it('invokes taskkill /T /F for a positive root pid', async () => {
    const execFileImpl = vi.fn(
      (_cmd: string, _args: readonly string[], callback: (error: Error | null) => void) => {
        callback(null)
      }
    )
    await terminateWindowsProcessTree(1234, {
      execFileImpl: execFileImpl as never
    })
    expect(execFileImpl).toHaveBeenCalledWith(
      'taskkill',
      ['/pid', '1234', '/T', '/F'],
      expect.any(Function)
    )
  })

  it('resolves even when taskkill reports failure (already dead)', async () => {
    const execFileImpl = vi.fn(
      (_cmd: string, _args: readonly string[], callback: (error: Error | null) => void) => {
        callback(new Error('not found'))
      }
    )
    await expect(
      terminateWindowsProcessTree(55, { execFileImpl: execFileImpl as never })
    ).resolves.toBeUndefined()
  })

  it('skips taskkill for invalid pids', async () => {
    const execFileImpl = vi.fn()
    await terminateWindowsProcessTree(0, { execFileImpl: execFileImpl as never })
    await terminateWindowsProcessTree(-1, { execFileImpl: execFileImpl as never })
    expect(execFileImpl).not.toHaveBeenCalled()
  })
})
