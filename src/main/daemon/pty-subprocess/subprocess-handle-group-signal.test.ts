import { afterEach, describe, expect, it, vi } from 'vitest'
import type * as pty from 'node-pty'
import { createDaemonPtySubprocessHandle } from './subprocess-handle'
import { mockPtyProcess } from '../pty-subprocess-test-harness'

const signalPosixPtyProcessGroups = vi.hoisted(() => vi.fn())

vi.mock('../../pty/posix-pty-process-groups', () => ({
  forceKillPosixPtyProcessGroups: vi.fn(),
  signalPosixPtyProcessGroups
}))

vi.mock('./foreground-process-tracker', () => ({
  createPtyForegroundProcessTracker: () => ({
    recordOutput: vi.fn(),
    markDead: vi.fn(),
    getForegroundProcess: () => null,
    confirmForegroundProcess: vi.fn(),
    confirmShellForeground: vi.fn()
  })
}))

function createHandle() {
  const proc = mockPtyProcess(10)
  const handle = createDaemonPtySubprocessHandle({
    process: proc as unknown as pty.IPty,
    shellPath: 'bash',
    spawnCwd: '/tmp',
    env: {},
    startupCommandDeliveredInShellArgs: false,
    reportsChildExitStatus: true,
    sessionId: 'group-signal',
    startupAgentRecognition: null
  })
  return { proc, handle }
}

describe('signalProcessGroups after the root exits', () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')

  afterEach(() => {
    signalPosixPtyProcessGroups.mockReset()
    vi.restoreAllMocks()
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform)
    }
  })

  it('SIGKILLs groups captured while the root was alive', () => {
    Object.defineProperty(process, 'platform', { configurable: true, value: 'linux' })
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)
    signalPosixPtyProcessGroups.mockImplementation(
      (
        _pid: number,
        _signal: NodeJS.Signals,
        _fallback: () => void,
        deps?: { signalProcessGroup?: (pgid: number) => void }
      ) => {
        deps?.signalProcessGroup?.(4242)
        deps?.signalProcessGroup?.(4243)
      }
    )
    const { proc, handle } = createHandle()

    handle.signalProcessGroups?.('SIGTERM')
    expect(kill).toHaveBeenCalledWith(-4242, 'SIGTERM')
    expect(kill).toHaveBeenCalledWith(-4243, 'SIGTERM')

    proc._simulateExit(0)
    kill.mockClear()
    signalPosixPtyProcessGroups.mockClear()

    handle.signalProcessGroups?.('SIGKILL')

    expect(signalPosixPtyProcessGroups).not.toHaveBeenCalled()
    expect(kill).toHaveBeenCalledWith(-4242, 'SIGKILL')
    expect(kill).toHaveBeenCalledWith(-4243, 'SIGKILL')
  })

  it('does not look up a root that exited before any group was captured', () => {
    Object.defineProperty(process, 'platform', { configurable: true, value: 'linux' })
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)
    const { proc, handle } = createHandle()

    proc._simulateExit(0)
    handle.signalProcessGroups?.('SIGKILL')

    expect(signalPosixPtyProcessGroups).not.toHaveBeenCalled()
    expect(kill).not.toHaveBeenCalled()
  })
})
