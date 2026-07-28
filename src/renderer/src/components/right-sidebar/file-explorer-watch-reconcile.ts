import type { Dispatch, SetStateAction } from 'react'
import type { FsChangedPayload } from '../../../../shared/types'
import type { DirCache } from './file-explorer-types'
import {
  isPathInsideOrEqual,
  normalizeRuntimePathForComparison
} from '../../../../shared/cross-platform-path'
import {
  purgeDirCacheSubtree,
  purgeExpandedDirsSubtree,
  clearStalePendingReveal
} from './file-explorer-watcher-reconcile'
import {
  canonicalizeFileExplorerWatchPath,
  normalizeExplorerAbsolutePath,
  parentDirForWatchPath,
  resolveCachedDirPath
} from './file-explorer-watch-path'

export type ProcessFileExplorerFsPayloadArgs = {
  payload: FsChangedPayload
  currentWorktreePath: string
  worktreeId: string
  cache: Record<string, DirCache>
  expanded: Set<string>
  setDirCache: Dispatch<SetStateAction<Record<string, DirCache>>>
  setSelectedPath: Dispatch<SetStateAction<string | null>>
  refreshDir: (dirPath: string) => void
  refreshTree: () => void
}

function cachedDirectoryContainsPath(
  cache: Record<string, DirCache>,
  cachedDirPath: string,
  childPath: string
): boolean {
  const target = normalizeRuntimePathForComparison(childPath)
  return (
    cache[cachedDirPath]?.children.some(
      (child) => normalizeRuntimePathForComparison(child.path) === target
    ) ?? false
  )
}

export function processFileExplorerFsPayload(args: ProcessFileExplorerFsPayloadArgs): void {
  const {
    payload,
    currentWorktreePath,
    worktreeId,
    cache,
    expanded,
    setDirCache,
    setSelectedPath,
    refreshDir,
    refreshTree
  } = args
  if (
    normalizeRuntimePathForComparison(payload.worktreePath) !==
    normalizeRuntimePathForComparison(currentWorktreePath)
  ) {
    return
  }

  const dirsToRefresh = new Set<string>()
  let needsFullRefresh = false

  for (const evt of payload.events) {
    if (evt.kind === 'overflow') {
      needsFullRefresh = true
      break
    }

    const normalizedPath = canonicalizeFileExplorerWatchPath(currentWorktreePath, evt.absolutePath)
    if (!normalizedPath) {
      continue
    }

    if (evt.kind === 'delete') {
      // Why: watcher can't report isDirectory for deletes; a dirCache key means it was an expanded dir (design §4.4).
      const cachedDir = resolveCachedDirPath(cache, normalizedPath, currentWorktreePath)
      const wasDirectory = cachedDir !== null

      if (wasDirectory && cachedDir) {
        purgeDirCacheSubtree(setDirCache, cachedDir)
        purgeExpandedDirsSubtree(worktreeId, cachedDir)
      }

      clearStalePendingReveal(normalizedPath)

      setSelectedPath((prev) => {
        if (
          prev &&
          normalizeRuntimePathForComparison(prev) ===
            normalizeRuntimePathForComparison(normalizedPath)
        ) {
          return null
        }
        if (prev && wasDirectory && isPathInsideOrEqual(normalizedPath, prev)) {
          return null
        }
        return prev
      })

      const parent = parentDirForWatchPath(normalizedPath)
      const cachedParent = resolveCachedDirPath(cache, parent, currentWorktreePath)
      if (cachedParent) {
        dirsToRefresh.add(cachedParent)
      }
    } else if (evt.kind === 'create' || evt.kind === 'rename') {
      // Why: create and rename both change a parent's listing. Rename was
      // previously deferred (#10264) so Explorer stayed stale until focus
      // remounted the tree. Case-insensitive cache lookup covers Windows
      // drive-letter / path casing drift between watcher and worktree path.
      const parent = parentDirForWatchPath(normalizedPath)
      const cachedParent = resolveCachedDirPath(cache, parent, currentWorktreePath)
      if (cachedParent) {
        dirsToRefresh.add(cachedParent)
      }
      if (evt.kind === 'rename') {
        const cachedDir = resolveCachedDirPath(cache, normalizedPath, currentWorktreePath)
        if (cachedDir) {
          purgeDirCacheSubtree(setDirCache, cachedDir)
          purgeExpandedDirsSubtree(worktreeId, cachedDir)
        }
      }
    } else if (evt.kind === 'update') {
      const cachedDir = resolveCachedDirPath(cache, normalizedPath, currentWorktreePath)
      if (evt.isDirectory === true && cachedDir) {
        dirsToRefresh.add(cachedDir)
        continue
      }

      const parent = parentDirForWatchPath(normalizedPath)
      const cachedParent = resolveCachedDirPath(cache, parent, currentWorktreePath)
      // Windows can classify a new file as update; existing file updates do not invalidate the tree.
      if (cachedParent && !cachedDirectoryContainsPath(cache, cachedParent, normalizedPath)) {
        dirsToRefresh.add(cachedParent)
      }
    }
  }

  if (needsFullRefresh) {
    refreshTree()
    return
  }

  const rootPath = normalizeExplorerAbsolutePath(currentWorktreePath)
  for (const dirPath of dirsToRefresh) {
    const isRoot =
      normalizeRuntimePathForComparison(dirPath) === normalizeRuntimePathForComparison(rootPath)
    const expandedHit =
      expanded.has(dirPath) ||
      [...expanded].some(
        (expandedPath) =>
          normalizeRuntimePathForComparison(expandedPath) ===
          normalizeRuntimePathForComparison(dirPath)
      )
    if (isRoot || expandedHit || dirPath in cache) {
      refreshDir(dirPath)
    }
  }
}
