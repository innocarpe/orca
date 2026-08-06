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

function withPlatform(platform: NodeJS.Platform, run: () => Promise<void>): Promise<void> {
  const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')
  Object.defineProperty(process, 'platform', { configurable: true, value: platform })
  return run().finally(() => {
    if (platformDescriptor) {
      Object.defineProperty(process, 'platform', platformDescriptor)
    }
  })
}

describe('killWorkspacePort', () => {
  const worktrees = [{ id: 'repo/wt', repoId: 'repo', displayName: 'wt', path: '/proj/wt' }]

  afterEach(() => {
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

  it('on Windows tree-kills the owning process so npm wrappers free the port', async () => {
    await withPlatform('win32', async () => {
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
    })
  })

  it('on Windows reports failure when the process is still alive after taskkill', async () => {
    await withPlatform('win32', async () => {
      scanWorkspacePortsMock.mockResolvedValue({
        platform: 'win32',
        scannedAt: Date.now(),
        ports: [workspacePort(4242, 5173)]
      })
      terminateWindowsProcessTreeMock.mockResolvedValue(undefined)
      vi.spyOn(process, 'kill').mockImplementation(() => true)
      const delayMs = vi.fn(async () => {})

      await expect(
        killWorkspacePort(worktrees, { pid: 4242, port: 5173, repoId: 'repo' }, { delayMs })
      ).resolves.toEqual({ ok: false, reason: 'Failed to stop the process.' })
      // Why: brief retries before declaring failure (PID may linger after TerminateProcess).
      expect(delayMs).toHaveBeenCalled()
    })
  })

  it('on Windows treats a transient post-taskkill probe as success once ESRCH appears', async () => {
    await withPlatform('win32', async () => {
      scanWorkspacePortsMock.mockResolvedValue({
        platform: 'win32',
        scannedAt: Date.now(),
        ports: [workspacePort(4242, 5173)]
      })
      terminateWindowsProcessTreeMock.mockResolvedValue(undefined)
      let probes = 0
      vi.spyOn(process, 'kill').mockImplementation(() => {
        probes += 1
        if (probes === 1) {
          return true
        }
        const err = new Error('kill ESRCH') as Error & { code?: string }
        err.code = 'ESRCH'
        throw err
      })
      const delayMs = vi.fn(async () => {})

      await expect(
        killWorkspacePort(worktrees, { pid: 4242, port: 5173, repoId: 'repo' }, { delayMs })
      ).resolves.toEqual({ ok: true })
      expect(probes).toBe(2)
      expect(delayMs).toHaveBeenCalledTimes(1)
    })
  })

  it('on Windows reports failure for EPERM liveness probes (still alive)', async () => {
    await withPlatform('win32', async () => {
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
    })
  })

  it('on POSIX SIGTERMs the owning process', async () => {
    await withPlatform('darwin', async () => {
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
    })
  })
})
