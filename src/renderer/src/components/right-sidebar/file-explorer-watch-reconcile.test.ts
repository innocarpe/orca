import { describe, expect, it, vi } from 'vitest'
import type { DirCache, TreeNode } from './file-explorer-types'
import { processFileExplorerFsPayload } from './file-explorer-watch-reconcile'

function cacheWithChildren(paths: string[]): DirCache {
  return {
    children: paths.map(
      (path): TreeNode => ({
        name: path.split(/[\\/]/).at(-1) ?? path,
        path,
        relativePath: path,
        isDirectory: false,
        depth: 0,
        operationOwner: { kind: 'local' }
      })
    ),
    loading: false,
    operationOwner: { kind: 'local' }
  }
}

function processUpdate(args: {
  root: string
  absolutePath: string
  isDirectory?: boolean
  cache: Record<string, DirCache>
}): ReturnType<typeof vi.fn> {
  const refreshDir = vi.fn()
  processFileExplorerFsPayload({
    payload: {
      worktreePath: args.root,
      events: [{ kind: 'update', absolutePath: args.absolutePath, isDirectory: args.isDirectory }]
    },
    currentWorktreePath: args.root,
    worktreeId: 'wt-1',
    cache: args.cache,
    expanded: new Set(),
    setDirCache: vi.fn(),
    setSelectedPath: vi.fn(),
    refreshDir,
    refreshTree: vi.fn()
  })
  return refreshDir
}

describe('processFileExplorerFsPayload update reconciliation', () => {
  it('refreshes a cached parent when Windows reports a new file as update', () => {
    const root = 'C:\\Repo'
    const refreshDir = processUpdate({
      root,
      absolutePath: 'c:\\repo\\new-file.txt',
      isDirectory: false,
      cache: { [root]: cacheWithChildren([`${root}\\existing.txt`]) }
    })

    expect(refreshDir).toHaveBeenCalledOnce()
    expect(refreshDir).toHaveBeenCalledWith(root)
  })

  it('does not reread a directory for an existing file content update', () => {
    const root = 'C:\\Repo'
    const refreshDir = processUpdate({
      root,
      absolutePath: 'c:\\repo\\EXISTING.txt',
      isDirectory: false,
      cache: { [root]: cacheWithChildren([`${root}\\existing.txt`]) }
    })

    expect(refreshDir).not.toHaveBeenCalled()
  })

  it('keeps POSIX child matching case-sensitive', () => {
    const root = '/repo'
    const refreshDir = processUpdate({
      root,
      absolutePath: '/repo/EXISTING.txt',
      isDirectory: false,
      cache: { [root]: cacheWithChildren(['/repo/existing.txt']) }
    })

    expect(refreshDir).toHaveBeenCalledWith(root)
  })

  it('refreshes an existing directory when the update identifies it as a directory', () => {
    const root = '/repo'
    const child = '/repo/src'
    const refreshDir = processUpdate({
      root,
      absolutePath: child,
      isDirectory: true,
      cache: { [root]: cacheWithChildren([child]), [child]: cacheWithChildren([]) }
    })

    expect(refreshDir).toHaveBeenCalledOnce()
    expect(refreshDir).toHaveBeenCalledWith(child)
  })

  it('deduplicates repeated remote update events for an absent child', () => {
    const root = '/srv/workspace'
    const refreshDir = vi.fn()
    processFileExplorerFsPayload({
      payload: {
        worktreePath: root,
        events: [
          { kind: 'update', absolutePath: `${root}/new.txt`, isDirectory: false },
          { kind: 'update', absolutePath: `${root}/new.txt`, isDirectory: false }
        ]
      },
      currentWorktreePath: root,
      worktreeId: 'folder::remote-1',
      cache: { [root]: cacheWithChildren([]) },
      expanded: new Set(),
      setDirCache: vi.fn(),
      setSelectedPath: vi.fn(),
      refreshDir,
      refreshTree: vi.fn()
    })

    expect(refreshDir).toHaveBeenCalledOnce()
    expect(refreshDir).toHaveBeenCalledWith(root)
  })

  it('ignores an update payload from another workspace', () => {
    const root = '/srv/workspace'
    const refreshDir = vi.fn()
    processFileExplorerFsPayload({
      payload: {
        worktreePath: '/srv/other',
        events: [{ kind: 'update', absolutePath: '/srv/other/new.txt', isDirectory: false }]
      },
      currentWorktreePath: root,
      worktreeId: 'folder::remote-1',
      cache: { [root]: cacheWithChildren([]) },
      expanded: new Set(),
      setDirCache: vi.fn(),
      setSelectedPath: vi.fn(),
      refreshDir,
      refreshTree: vi.fn()
    })

    expect(refreshDir).not.toHaveBeenCalled()
  })
})
