import type { BrowserWindow } from 'electron'
import type { MarkdownDocument } from '../../shared/types'
import { authorizeExternalPath } from '../ipc/filesystem-auth'
import { ensureDefaultFloatingWorkspacePath } from '../ipc/floating-workspace-directory'
import { isMarkdownDocumentName, markdownDocumentFromFilePath } from '../ipc/markdown-documents'
import { extractMarkdownPathsFromArgv, mergeMarkdownOpenPaths } from './os-open-markdown-paths'

export type OsOpenMarkdownBridge = {
  enqueuePaths: (paths: readonly string[]) => void
  enqueueArgv: (argv: readonly string[]) => void
  /** Deliver queued paths to the main window when the renderer can receive IPC. */
  flush: (getMainWindow: () => BrowserWindow | null) => Promise<void>
  peekQueuedPaths: () => readonly string[]
}

export function createOsOpenMarkdownBridge(options: {
  platform?: NodeJS.Platform
  resolveFloatingRoot?: () => Promise<string>
  authorizePath?: (filePath: string) => void
}): OsOpenMarkdownBridge {
  const platform = options.platform ?? process.platform
  const resolveFloatingRoot =
    options.resolveFloatingRoot ?? (() => ensureDefaultFloatingWorkspacePath())
  const authorizePath = options.authorizePath ?? authorizeExternalPath
  let queued: string[] = []
  let flushInFlight: Promise<void> | null = null

  const enqueuePaths = (paths: readonly string[]): void => {
    queued = mergeMarkdownOpenPaths(queued, paths, { platform })
  }

  return {
    enqueuePaths,
    enqueueArgv: (argv) => {
      enqueuePaths(extractMarkdownPathsFromArgv(argv, { platform }))
    },
    peekQueuedPaths: () => queued,
    flush: async (getMainWindow) => {
      if (flushInFlight) {
        return flushInFlight
      }
      flushInFlight = (async () => {
        if (queued.length === 0) {
          return
        }
        const mainWindow = getMainWindow()
        if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
          return
        }

        const pending = queued
        queued = []
        const root = await resolveFloatingRoot()
        // Why: window can close during await; never send on a destroyed webContents.
        if (mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
          queued = mergeMarkdownOpenPaths(queued, pending, { platform })
          return
        }
        const documents: MarkdownDocument[] = []
        for (const filePath of pending) {
          if (!isMarkdownDocumentName(filePath)) {
            continue
          }
          try {
            authorizePath(filePath)
            documents.push(
              markdownDocumentFromFilePath(root, filePath, { outsideRootRelativePath: 'basename' })
            )
          } catch (error) {
            console.warn(
              '[os-open-markdown] Skipping path that failed authorization or resolution:',
              filePath,
              error instanceof Error ? error.message : error
            )
          }
        }
        if (documents.length === 0) {
          return
        }
        // Why: cold-start renderer may not have subscribed yet — retry once, re-queue on total miss.
        const deliver = (): void => {
          mainWindow.webContents.send('ui:openFloatingMarkdownDocuments', documents)
        }
        try {
          deliver()
        } catch (error) {
          console.warn('[os-open-markdown] Failed to deliver documents to the renderer:', error)
          queued = mergeMarkdownOpenPaths(
            queued,
            pending,
            { platform }
          )
          return
        }
        await new Promise((resolve) => setTimeout(resolve, 250))
        if (mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
          return
        }
        try {
          deliver()
        } catch (error) {
          console.warn('[os-open-markdown] Retry deliver failed:', error)
        }
      })().finally(() => {
        flushInFlight = null
      })
      return flushInFlight
    }
  }
}
