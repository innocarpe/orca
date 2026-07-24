import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkspacePort } from '../../shared/workspace-ports'

const { scanWorkspacePortsMock, terminateWindowsProcessTreeMock } = vi.hoisted(() => ({
  scanWorkspacePortsMock: vi.fn(),
  terminateWindowsProcessTreeMock: vi.fn()
}))

vi.mock('./local-workspace-port-scanner', () => ({
  scanWorkspacePorts: scanWorkspacePortsMock
}))

vi.mock('../windows-process-tree-kill', () => ({
  terminateWindowsProcessTree: terminateWindowsProcessTreeMock
}))

import { killWorkspacePort } from './workspace-port-ownership'

function workspacePort(pid: number, port: number): WorkspacePort {
  return {
    id: `ws-${port}`,
    bindHost: '127.0.0.1',
    connectHost: '127.0.0.1',
    port,
    pid,
    protocol: 'http',
    kind: 'workspace',
    owner: {
      worktreeId: 'repo/wt',
      repoId: 'repo',
      displayName: 'wt',
      path: '/proj/wt',
      confidence: 'cwd'
    }
  }
}

describe('killWorkspacePort', () => {
  const worktrees = [{ id: 'repo/wt', repoId: 'repo', displayName: 'wt', path: '/proj/wt' }]

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('on Windows tree-kills the owning process so npm wrappers free the port', async () => {
    const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' })
    scanWorkspacePortsMock.mockResolvedValue({
      platform: 'win32',
      scannedAt: Date.now(),
      ports: [workspacePort(4242, 5173)]
    })
    terminateWindowsProcessTreeMock.mockResolvedValue(undefined)
    // process.kill(pid, 0) throws ESRCH when the process is gone (success path).
    const killMock = vi.spyOn(process, 'kill').mockImplementation(() => {
      const err = new Error('kill ESRCH') as Error & { code?: string }
      err.code = 'ESRCH'
      throw err
    })

    await expect(
      killWorkspacePort(worktrees, { pid: 4242, port: 5173, repoId: 'repo' })
    ).resolves.toEqual({ ok: true })
    expect(terminateWindowsProcessTreeMock).toHaveBeenCalledWith(4242)
    expect(killMock).toHaveBeenCalledWith(4242, 0)

    if (platformDescriptor) {
      Object.defineProperty(process, 'platform', platformDescriptor)
    }
  })

  it('on Windows reports failure when the process is still alive after taskkill', async () => {
    const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' })
    scanWorkspacePortsMock.mockResolvedValue({
      platform: 'win32',
      scannedAt: Date.now(),
      ports: [workspacePort(4242, 5173)]
    })
    terminateWindowsProcessTreeMock.mockResolvedValue(undefined)
    vi.spyOn(process, 'kill').mockImplementation(() => true)

    await expect(
      killWorkspacePort(worktrees, { pid: 4242, port: 5173, repoId: 'repo' })
    ).resolves.toEqual({ ok: false, reason: 'Failed to stop the process.' })

    if (platformDescriptor) {
      Object.defineProperty(process, 'platform', platformDescriptor)
    }
  })

  it('on Windows reports failure for EPERM liveness probes (still alive)', async () => {
    const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' })
    scanWorkspacePortsMock.mockResolvedValue({
      platform: 'win32',
      scannedAt: Date.now(),
      ports: [workspacePort(4242, 5173)]
    })
    terminateWindowsProcessTreeMock.mockResolvedValue(undefined)
    vi.spyOn(process, 'kill').mockImplementation(() => {
      const err = new Error('kill EPERM') as Error & { code?: string }
      err.code = 'EPERM'
      throw err
    })

    await expect(
      killWorkspacePort(worktrees, { pid: 4242, port: 5173, repoId: 'repo' })
    ).resolves.toEqual({ ok: false, reason: 'kill EPERM' })

    if (platformDescriptor) {
      Object.defineProperty(process, 'platform', platformDescriptor)
    }
  })

  it('on POSIX SIGTERMs the owning process', async () => {
    const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { configurable: true, value: 'darwin' })
    const killMock = vi.spyOn(process, 'kill').mockImplementation(() => true)
    scanWorkspacePortsMock.mockResolvedValue({
      platform: 'darwin',
      scannedAt: Date.now(),
      ports: [workspacePort(99, 3000)]
    })
    terminateWindowsProcessTreeMock.mockClear()

    await expect(
      killWorkspacePort(worktrees, { pid: 99, port: 3000, repoId: 'repo' })
    ).resolves.toEqual({ ok: true })
    expect(killMock).toHaveBeenCalledWith(99, 'SIGTERM')
    expect(terminateWindowsProcessTreeMock).not.toHaveBeenCalled()

    if (platformDescriptor) {
      Object.defineProperty(process, 'platform', platformDescriptor)
    }
  })
})
