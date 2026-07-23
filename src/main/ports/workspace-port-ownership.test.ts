import { afterEach, describe, expect, it, vi } from 'vitest'
import { killWorkspacePort } from './workspace-port-ownership'

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

const worktrees = [{ id: 'repo::/repo', repoId: 'repo', displayName: 'main', path: '/repo' }]

describe('killWorkspacePort', () => {
  afterEach(() => {
    scanWorkspacePortsMock.mockReset()
    terminateWindowsProcessTreeMock.mockReset()
    vi.restoreAllMocks()
  })

  // Regression for #11161 review: on an EDR-hooked host the background poller
  // alternates the metadata skip, so an unscoped skip would fail Stop with
  // "Only workspace-owned local processes can be stopped here" every other try.
  it('requires owner metadata from the authorizing re-scan', async () => {
    scanWorkspacePortsMock.mockResolvedValue({ platform: 'darwin', scannedAt: 0, ports: [] })

    await killWorkspacePort(worktrees, { pid: 123, port: 5173 })

    expect(scanWorkspacePortsMock).toHaveBeenCalledWith(worktrees, undefined, {
      requireMetadata: true
    })
  })

  it('refuses a pid the re-scan does not attribute to a workspace', async () => {
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true)
    scanWorkspacePortsMock.mockResolvedValue({
      platform: 'darwin',
      scannedAt: 0,
      ports: [
        {
          id: '127.0.0.1:5173:123',
          bindHost: '127.0.0.1',
          connectHost: '127.0.0.1',
          port: 5173,
          pid: 123,
          protocol: 'http',
          kind: 'external'
        }
      ]
    })

    const result = await killWorkspacePort(worktrees, { pid: 123, port: 5173 })

    expect(result).toEqual({
      ok: false,
      reason: 'Only workspace-owned local processes can be stopped here.'
    })
    expect(killSpy).not.toHaveBeenCalled()
  })

  it('on Windows tree-kills the owning process so npm children free the port', async () => {
    const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' })
    terminateWindowsProcessTreeMock.mockResolvedValue(undefined)
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true)
    scanWorkspacePortsMock.mockResolvedValue({
      platform: 'win32',
      scannedAt: 0,
      ports: [
        {
          id: '127.0.0.1:5173:123',
          host: '127.0.0.1',
          port: 5173,
          pid: 123,
          kind: 'workspace',
          worktreeId: 'repo::/repo',
          repoId: 'repo',
          displayName: 'main',
          path: '/repo'
        }
      ]
    })

    await expect(killWorkspacePort(worktrees, { pid: 123, port: 5173 })).resolves.toEqual({
      ok: true
    })
    expect(terminateWindowsProcessTreeMock).toHaveBeenCalledWith(123)
    expect(killSpy).not.toHaveBeenCalled()

    if (platformDescriptor) {
      Object.defineProperty(process, 'platform', platformDescriptor)
    }
  })

})
