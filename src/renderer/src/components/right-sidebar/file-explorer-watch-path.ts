import { joinPath, dirname, normalizeRelativePath } from '@/lib/path'
import {
  normalizeRuntimePathForComparison,
  relativePathInsideRoot
} from '../../../../shared/cross-platform-path'
import type { FsChangedPayload } from '../../../../shared/types'

export function normalizeExplorerAbsolutePath(path: string): string {
  return path === '/' || /^[A-Za-z]:[\\/]$/.test(path) ? path : path.replace(/[\\/]+$/, '')
}

export function getExternalFileChangeRelativePath(
  worktreePath: string,
  absolutePath: string,
  isDirectory: boolean | undefined
): string | null {
  if (isDirectory === true) {
    return null
  }

  const relativePath = relativePathInsideRoot(worktreePath, absolutePath)
  if (relativePath === null || relativePath === '') {
    return null
  }

  // Why: EditorPanel reloads tabs only from a worktree-relative path, not the watcher's absolute one; normalize or contents go stale.
  return normalizeRelativePath(relativePath)
}

export function canonicalizeFileExplorerWatchPath(
  worktreePath: string,
  absolutePath: string
): string | null {
  const relativePath = relativePathInsideRoot(worktreePath, absolutePath)
  if (relativePath === null) {
    return null
  }

  const rootPath = normalizeExplorerAbsolutePath(worktreePath)
  return relativePath === '' ? rootPath : joinPath(rootPath, relativePath)
}

/**
 * Map an event path to the dirCache key that should be refreshed.
 * Windows watchers often differ in drive-letter casing from the worktree key.
 */
export function resolveCachedDirPath(
  cache: Record<string, { children: unknown }>,
  dirPath: string,
  worktreePath?: string
): string | null {
  if (dirPath in cache) {
    return dirPath
  }
  const target = normalizeRuntimePathForComparison(dirPath)
  for (const key of Object.keys(cache)) {
    if (normalizeRuntimePathForComparison(key) === target) {
      return key
    }
  }
  if (worktreePath && normalizeRuntimePathForComparison(worktreePath) === target) {
    return normalizeExplorerAbsolutePath(worktreePath)
  }
  return null
}

export function payloadRequiresDeferredTreeRefresh(
  payload: FsChangedPayload,
  currentWorktreePath: string
): boolean {
  if (
    normalizeRuntimePathForComparison(payload.worktreePath) !==
    normalizeRuntimePathForComparison(currentWorktreePath)
  ) {
    return false
  }

  return payload.events.some((evt) => evt.kind === 'rename')
}

export function parentDirForWatchPath(normalizedPath: string): string {
  return normalizeExplorerAbsolutePath(dirname(normalizedPath))
}
