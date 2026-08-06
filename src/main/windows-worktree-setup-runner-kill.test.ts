import { join } from 'node:path'
import type * as fsPromises from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import type { WindowsProcessRow } from './providers/windows-foreground-process-rows'
import {
  commandLineTargetsWorktreeSetupRunner,
  extractSetupRunnerPathsFromCommandLine,
  resolveWorktreeGitDirPath,
  terminateWindowsSetupRunnersForWorktree,
  terminateWindowsSetupRunnersForWorktreeId
} from './windows-worktree-setup-runner-kill'

function row(
  partial: Partial<WindowsProcessRow> & Pick<WindowsProcessRow, 'pid' | 'command'>
): WindowsProcessRow {
  return {
    ppid: 1,
    name: 'cmd.exe',
    executablePath: 'C:\\Windows\\System32\\cmd.exe',
    ...partial
  }
}

describe('extractSetupRunnerPathsFromCommandLine', () => {
  it('extracts drive-qualified setup-runner paths from cmd.exe lines', () => {
    expect(
      extractSetupRunnerPathsFromCommandLine(
        'C:\\Windows\\system32\\cmd.exe /c "D:/repo/.git/worktrees/feature/orca/setup-runner.cmd"'
      )
    ).toEqual(['D:/repo/.git/worktrees/feature/orca/setup-runner.cmd'])
  })

  it('extracts backslash Windows paths', () => {
    expect(
      extractSetupRunnerPathsFromCommandLine(
        'cmd.exe /c C:\\repo\\.git\\worktrees\\feature\\orca\\setup-runner.cmd'
      )
    ).toEqual(['C:\\repo\\.git\\worktrees\\feature\\orca\\setup-runner.cmd'])
  })
})

describe('commandLineTargetsWorktreeSetupRunner', () => {
  const worktreePath = 'D:\\orca\\workspaces\\repo\\feature'

  it('matches setup-runner under a resolved linked-worktree gitdir', () => {
    expect(
      commandLineTargetsWorktreeSetupRunner(
        'C:\\Windows\\system32\\cmd.exe /c D:/repo/.git/worktrees/feature/orca/setup-runner.cmd',
        worktreePath,
        ['D:/repo/.git/worktrees/feature']
      )
    ).toBe(true)
  })

  it('matches linked-worktree setup-runner when the command references the gitdir anchor', () => {
    expect(
      commandLineTargetsWorktreeSetupRunner(
        'C:\\Windows\\system32\\cmd.exe /c D:/repo/.git/worktrees/feature/orca/setup-runner.cmd',
        worktreePath,
        ['D:/repo/.git/worktrees/feature']
      )
    ).toBe(true)
  })

  it('does not match a same-named worktree under a different repo root', () => {
    // Why: basename-only `.git/worktrees/feature/...` must not kill another repo's runner.
    expect(
      commandLineTargetsWorktreeSetupRunner(
        'C:\\Windows\\system32\\cmd.exe /c D:/other/repo/.git/worktrees/feature/orca/setup-runner.cmd',
        worktreePath
      )
    ).toBe(false)
  })

  it('matches setup-runner living under the worktree path itself', () => {
    expect(
      commandLineTargetsWorktreeSetupRunner(
        `cmd.exe /c ${worktreePath}\\.git\\orca\\setup-runner.cmd`,
        worktreePath
      )
    ).toBe(true)
  })

  it('ignores setup-runners for a different worktree name', () => {
    expect(
      commandLineTargetsWorktreeSetupRunner(
        'cmd.exe /c D:/repo/.git/worktrees/other-feature/orca/setup-runner.cmd',
        worktreePath
      )
    ).toBe(false)
  })

  it('ignores unrelated cmd.exe processes', () => {
    expect(
      commandLineTargetsWorktreeSetupRunner('C:\\Windows\\system32\\cmd.exe /c dir', worktreePath)
    ).toBe(false)
  })
})

describe('resolveWorktreeGitDirPath', () => {
  it('returns an absolute gitdir path as-is', async () => {
    const readFileImpl = vi.fn(
      async () => 'gitdir: D:/repo/.git/worktrees/feature\n'
    ) as unknown as typeof fsPromises.readFile
    await expect(
      resolveWorktreeGitDirPath('D:\\orca\\workspaces\\repo\\feature', { readFileImpl })
    ).resolves.toBe('D:/repo/.git/worktrees/feature')
  })

  it('returns null when .git is missing', async () => {
    const readFileImpl = vi.fn(async () => {
      throw Object.assign(new Error('enoent'), { code: 'ENOENT' })
    })
    await expect(resolveWorktreeGitDirPath('D:\\missing', { readFileImpl })).resolves.toBeNull()
  })

  it('returns the .git directory when EISDIR', async () => {
    const readFileImpl = vi.fn(async () => {
      throw Object.assign(new Error('eisdir'), { code: 'EISDIR' })
    })
    await expect(resolveWorktreeGitDirPath('/repo/main', { readFileImpl })).resolves.toBe(
      join('/repo/main', '.git')
    )
  })
})

describe('terminateWindowsSetupRunnersForWorktree', () => {
  it('no-ops on non-Windows platforms', async () => {
    const listProcessRows = vi.fn(async () => [
      row({
        pid: 42,
        command: 'cmd.exe /c D:/repo/.git/worktrees/feature/orca/setup-runner.cmd'
      })
    ])
    const killTree = vi.fn(async () => {})
    await expect(
      terminateWindowsSetupRunnersForWorktree('D:\\orca\\workspaces\\repo\\feature', {
        platform: 'darwin',
        listProcessRows,
        killTree
      })
    ).resolves.toBe(0)
    expect(listProcessRows).not.toHaveBeenCalled()
    expect(killTree).not.toHaveBeenCalled()
  })

  it('no-ops for non-Windows worktree paths even on win32', async () => {
    const listProcessRows = vi.fn(async () => [])
    await expect(
      terminateWindowsSetupRunnersForWorktree('/home/me/repo/feature', {
        platform: 'win32',
        listProcessRows
      })
    ).resolves.toBe(0)
    expect(listProcessRows).not.toHaveBeenCalled()
  })

  it('taskkills matching setup-runner trees before Git removal (#10629)', async () => {
    const listProcessRows = vi.fn(async () => [
      row({
        pid: 5936,
        command:
          'C:\\Windows\\system32\\cmd.exe /c D:/repo/.git/worktrees/feature/orca/setup-runner.cmd'
      }),
      row({
        pid: 7000,
        command: 'cmd.exe /c D:/repo/.git/worktrees/other/orca/setup-runner.cmd'
      }),
      row({
        pid: 8000,
        command: 'powershell.exe -NoProfile'
      })
    ])
    const killTree = vi.fn(async () => {})

    const killed = await terminateWindowsSetupRunnersForWorktree(
      'D:\\orca\\workspaces\\repo\\feature',
      {
        platform: 'win32',
        listProcessRows,
        killTree,
        pathAnchors: ['D:/repo/.git/worktrees/feature']
      }
    )

    expect(killed).toBe(1)
    expect(killTree).toHaveBeenCalledTimes(1)
    expect(killTree).toHaveBeenCalledWith(5936)
  })

  it('dedupes PIDs and swallows kill failures', async () => {
    const listProcessRows = vi.fn(async () => [
      row({
        pid: 11,
        command: 'cmd.exe /c D:/repo/.git/worktrees/feature/orca/setup-runner.cmd'
      }),
      row({
        pid: 11,
        command: 'cmd.exe /c D:/repo/.git/worktrees/feature/orca/setup-runner.cmd'
      })
    ])
    const killTree = vi.fn(async () => {
      throw new Error('access denied')
    })

    await expect(
      terminateWindowsSetupRunnersForWorktree('D:\\orca\\workspaces\\repo\\feature', {
        platform: 'win32',
        listProcessRows,
        killTree,
        pathAnchors: ['D:/repo/.git/worktrees/feature']
      })
    ).resolves.toBe(1)
    expect(killTree).toHaveBeenCalledTimes(1)
  })

  it('returns 0 when process enumeration fails', async () => {
    const listProcessRows = vi.fn(async () => {
      throw new Error('powershell missing')
    })
    const killTree = vi.fn(async () => {})
    await expect(
      terminateWindowsSetupRunnersForWorktree('D:\\orca\\workspaces\\repo\\feature', {
        platform: 'win32',
        listProcessRows,
        killTree
      })
    ).resolves.toBe(0)
    expect(killTree).not.toHaveBeenCalled()
  })

  it('bounds gitdir resolution by the teardown deadline', async () => {
    vi.useFakeTimers()
    try {
      let resolveGitDir: (value: string | null) => void = () => {}
      const listProcessRows = vi.fn(async () => [])
      const deadlineMs = Date.now() + 10
      const sweep = terminateWindowsSetupRunnersForWorktree('D:\\orca\\workspaces\\repo\\feature', {
        platform: 'win32',
        resolveGitDirPath: () =>
          new Promise<string | null>((resolve) => {
            resolveGitDir = resolve
          }),
        listProcessRows,
        deadlineMs,
        now: Date.now
      })

      await vi.advanceTimersByTimeAsync(10)
      await expect(sweep).resolves.toBe(0)
      expect(listProcessRows).not.toHaveBeenCalled()
      resolveGitDir(null)
    } finally {
      vi.useRealTimers()
    }
  })

  it('bounds process enumeration by the teardown deadline', async () => {
    vi.useFakeTimers()
    try {
      let resolveRows: (value: WindowsProcessRow[]) => void = () => {}
      const killTree = vi.fn(async () => {})
      const deadlineMs = Date.now() + 10
      const sweep = terminateWindowsSetupRunnersForWorktree('D:\\orca\\workspaces\\repo\\feature', {
        platform: 'win32',
        pathAnchors: ['D:/repo/.git/worktrees/feature'],
        listProcessRows: () =>
          new Promise<WindowsProcessRow[]>((resolve) => {
            resolveRows = resolve
          }),
        killTree,
        deadlineMs,
        now: Date.now
      })

      await vi.advanceTimersByTimeAsync(10)
      await expect(sweep).resolves.toBe(0)
      expect(killTree).not.toHaveBeenCalled()
      resolveRows([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('bounds process-tree termination aggregation by the teardown deadline', async () => {
    vi.useFakeTimers()
    try {
      let resolveKill: () => void = () => {}
      const listProcessRows = vi.fn(async () => [
        row({
          pid: 42,
          command: 'cmd.exe /c D:/repo/.git/worktrees/feature/orca/setup-runner.cmd'
        })
      ])
      const killTree = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveKill = resolve
          })
      )
      const deadlineMs = Date.now() + 10
      const sweep = terminateWindowsSetupRunnersForWorktree('D:\\orca\\workspaces\\repo\\feature', {
        platform: 'win32',
        pathAnchors: ['D:/repo/.git/worktrees/feature'],
        listProcessRows,
        killTree,
        deadlineMs,
        now: Date.now
      })

      await vi.advanceTimersByTimeAsync(0)
      expect(killTree).toHaveBeenCalledWith(42)
      await vi.advanceTimersByTimeAsync(10)
      await expect(sweep).resolves.toBe(0)
      resolveKill()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('terminateWindowsSetupRunnersForWorktreeId', () => {
  it('resolves the worktree path and kills matching runners', async () => {
    const listProcessRows = vi.fn(async () => [
      row({
        pid: 42,
        command: 'cmd.exe /c D:/repo/.git/worktrees/feature/orca/setup-runner.cmd'
      })
    ])
    const killTree = vi.fn(async () => {})
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})

    await expect(
      terminateWindowsSetupRunnersForWorktreeId('repo-1::D:\\orca\\workspaces\\repo\\feature', {
        platform: 'win32',
        listProcessRows,
        killTree,
        pathAnchors: ['D:/repo/.git/worktrees/feature']
      })
    ).resolves.toBe(1)
    expect(killTree).toHaveBeenCalledWith(42)
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining('killed 1 Windows setup-runner process tree(s)')
    )
    info.mockRestore()
  })

  it('skips when the teardown deadline has already elapsed', async () => {
    const listProcessRows = vi.fn(async () => [])
    await expect(
      terminateWindowsSetupRunnersForWorktreeId('repo-1::D:\\orca\\workspaces\\repo\\feature', {
        platform: 'win32',
        listProcessRows,
        deadlineMs: 10,
        now: () => 20
      })
    ).resolves.toBe(0)
    expect(listProcessRows).not.toHaveBeenCalled()
  })

  it('skips POSIX worktree paths on win32', async () => {
    const listProcessRows = vi.fn(async () => [])
    await expect(
      terminateWindowsSetupRunnersForWorktreeId('repo-1::/home/me/repo/feature', {
        platform: 'win32',
        listProcessRows
      })
    ).resolves.toBe(0)
    expect(listProcessRows).not.toHaveBeenCalled()
  })
})
