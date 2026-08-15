import { useCallback, useRef } from 'react'
import type { FileExplorerOperationOwner } from './file-explorer-types'
import { pasteClipboardFilesIntoExplorerFolder } from './file-explorer-clipboard-paste'

type UseFileExplorerPasteParams = {
  worktreePath: string | null
  activeWorktreeId: string | null
  refreshDir: (dirPath: string) => Promise<void>
  setSelectedPath: (path: string | null) => void
  operationOwner?: FileExplorerOperationOwner
}

export function useFileExplorerPaste({
  worktreePath,
  activeWorktreeId,
  refreshDir,
  setSelectedPath,
  operationOwner
}: UseFileExplorerPasteParams): (destinationDir: string) => void {
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

  return useCallback((destinationDir: string) => {
    void pasteClipboardFilesIntoExplorerFolder({
      destinationDir,
      worktreeId: activeWorktreeIdRef.current,
      worktreePath: worktreePathRef.current,
      operationOwner: operationOwnerRef.current,
      refreshDir: refreshDirRef.current,
      setSelectedPath: setSelectedPathRef.current
    })
  }, [])
}
