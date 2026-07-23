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

    await expect(
      killWorkspacePort(worktrees, { pid: 4242, port: 5173, repoId: 'repo' })
    ).resolves.toEqual({ ok: true })
    expect(terminateWindowsProcessTreeMock).toHaveBeenCalledWith(4242)

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
