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
        // Why: renderer may still be mounting listeners on a cold start; a short retry covers that race.
        mainWindow.webContents.send('ui:openFloatingMarkdownDocuments', documents)
      })().finally(() => {
        flushInFlight = null
      })
      return flushInFlight
    }
  }
}
