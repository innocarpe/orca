import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Session, type SubprocessHandle } from './session'

const killWithDescendantSweepMock = vi.hoisted(() => vi.fn())
vi.mock('../pty-descendant-termination', () => ({
  killWithDescendantSweep: killWithDescendantSweepMock
}))

describe('Session force-kill escalation (#10475)', () => {
  let platformDescriptor: PropertyDescriptor | undefined
  let session: Session | undefined
  let forceKill: ReturnType<typeof vi.fn>
  let onExitCb: ((code: number) => void) | null

  beforeEach(() => {
    platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')
    killWithDescendantSweepMock.mockReset()
    killWithDescendantSweepMock.mockImplementation(async (_pid: number, killRoot: () => void) => {
      killRoot()
    })
    forceKill = vi.fn()
    onExitCb = null
  })

  afterEach(() => {
    session?.dispose()
    session = undefined
    if (platformDescriptor) {
      Object.defineProperty(process, 'platform', platformDescriptor)
    }
  })

  it('on Windows re-tree-kills when force-escalating a stubborn agent PTY', async () => {
    Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' })
    const subprocess: SubprocessHandle = {
      pid: 4242,
      getForegroundProcess: () => null,
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      forceKill: (...args: unknown[]) => forceKill(...args),
      signal: vi.fn(),
      onData: vi.fn(),
      onExit: (cb) => {
        onExitCb = cb
      },
      dispose: vi.fn()
    }
    session = new Session({
      sessionId: 'hermes-force',
      cols: 80,
      rows: 24,
      launchAgent: 'hermes',
      subprocess,
      shellReadySupported: false
    })

    const shutdown = session.forceKillAndWaitForExit()
    expect(killWithDescendantSweepMock).toHaveBeenCalledWith(
      4242,
      expect.any(Function),
      expect.objectContaining({ ownsRoot: expect.any(Function) })
    )
    expect(forceKill).toHaveBeenCalled()

    onExitCb?.(137)
    await shutdown
    expect(session.state).toBe('exited')
  })

  it('on Windows mid-wait escalate is tree-kill-only (no second ConPTY forceKill)', async () => {
    vi.useFakeTimers()
    try {
      Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' })
      const subprocess: SubprocessHandle = {
        pid: 5150,
        getForegroundProcess: () => null,
        write: vi.fn(),
        resize: vi.fn(),
        kill: vi.fn(),
        forceKill: (...args: unknown[]) => forceKill(...args),
        signal: vi.fn(),
        onData: vi.fn(),
        onExit: (cb) => {
          onExitCb = cb
        },
        dispose: vi.fn()
      }
      session = new Session({
        sessionId: 'hermes-mid-wait',
        cols: 80,
        rows: 24,
        launchAgent: 'hermes',
        subprocess,
        shellReadySupported: false
      })

      const shutdown = session.forceKillAndWaitForExit(8_000)
      expect(forceKill).toHaveBeenCalledTimes(1)
      expect(killWithDescendantSweepMock).toHaveBeenCalledTimes(1)

      // First grace expires without physical exit → mid-wait tree-kill escalate.
      await vi.advanceTimersByTimeAsync(1_500)
      expect(killWithDescendantSweepMock).toHaveBeenCalledTimes(2)
      // Why: ConPTY force already issued; re-resetting forceKillSent is a no-op path.
      expect(forceKill).toHaveBeenCalledTimes(1)

      onExitCb?.(137)
      await shutdown
      expect(session?.state).toBe('exited')
    } finally {
      vi.useRealTimers()
    }
  })
})
