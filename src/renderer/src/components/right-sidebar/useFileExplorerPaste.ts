import { useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { extractIpcErrorMessage } from '@/lib/ipc-error'
import type { FileExplorerOperationOwner, TreeNode } from './file-explorer-types'
import { importFileExplorerExternalPaths } from './useFileExplorerImport'

export function isFileExplorerPasteShortcut(
  event: KeyboardEvent,
  userAgent = navigator.userAgent
): boolean {
  if (event.key.toLowerCase() !== 'v' || event.altKey || event.shiftKey) {
    return false
  }
  if (userAgent.includes('Mac')) {
    return event.metaKey && !event.ctrlKey
  }
  return event.ctrlKey && !event.metaKey
}

export function getFileExplorerPasteDestination({
  focusedNode,
  selectedNode,
  worktreePath
}: {
  focusedNode: TreeNode | null
  selectedNode: TreeNode | null
  worktreePath: string | null
}): { dir: string; operationOwner?: FileExplorerOperationOwner } | null {
  if (focusedNode?.isDirectory) {
    return { dir: focusedNode.path, operationOwner: focusedNode.operationOwner }
  }
  if (selectedNode?.isDirectory) {
    return { dir: selectedNode.path, operationOwner: selectedNode.operationOwner }
  }
  return worktreePath ? { dir: worktreePath } : null
}

export function useFileExplorerPaste({
  worktreePath,
  activeWorktreeId,
  refreshDir,
  setSelectedPath,
  operationOwner
}: {
  worktreePath: string | null
  activeWorktreeId: string | null
  refreshDir: (dirPath: string) => Promise<void>
  setSelectedPath: (path: string | null) => void
  operationOwner?: FileExplorerOperationOwner
}): (destinationDir: string, destinationOwner?: FileExplorerOperationOwner) => void {
  const worktreePathRef = useRef(worktreePath)
  worktreePathRef.current = worktreePath
  const activeWorktreeIdRef = useRef(activeWorktreeId)
  activeWorktreeIdRef.current = activeWorktreeId
  const refreshDirRef = useRef(refreshDir)
  refreshDirRef.current = refreshDir
  const setSelectedPathRef = useRef(setSelectedPath)
  setSelectedPathRef.current = setSelectedPath
  const operationOwnerRef = useRef(operationOwner)
  operationOwnerRef.current = operationOwner

  return useCallback((destinationDir: string, destinationOwner?: FileExplorerOperationOwner) => {
    void (async () => {
      const wtId = activeWorktreeIdRef.current
      const wtPath = worktreePathRef.current
      if (!wtId || !wtPath) {
        return
      }
      let sourcePaths: string[]
      try {
        sourcePaths = await window.api.ui.readClipboardFiles()
      } catch (err) {
        toast.error(extractIpcErrorMessage(err, 'Failed to read clipboard files.'))
        return
      }
      if (sourcePaths.length === 0) {
        return
      }
      await importFileExplorerExternalPaths({
        worktreeId: wtId,
        worktreePath: wtPath,
        sourcePaths,
        destinationDir,
        refreshDir: refreshDirRef.current,
        setSelectedPath: setSelectedPathRef.current,
        operationOwner: destinationOwner ?? operationOwnerRef.current
      })
    })()
  }, [])
}
