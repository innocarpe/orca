// @vitest-environment happy-dom
import React, { useRef } from 'react'
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TreeNode } from './file-explorer-types'
import { createFileExplorerRowProjection } from './file-explorer-row-projection'
import { useAppStore } from '@/store'
import { FileExplorerBackgroundMenu } from './FileExplorerBackgroundMenu'
import { useFileExplorerKeys } from './useFileExplorerKeys'
import {
  getFileExplorerPasteDestination,
  isFileExplorerPasteShortcut,
  useFileExplorerPaste
} from './useFileExplorerPaste'
import { importFileExplorerExternalPaths } from './useFileExplorerImport'

vi.mock('./useFileExplorerImport', () => ({
  importFileExplorerExternalPaths: vi.fn()
}))

function node(path: string, isDirectory: boolean, depth = 0): TreeNode {
  return {
    name: path.split('/').at(-1) ?? path,
    path,
    relativePath: path.replace('/repo/', ''),
    isDirectory,
    depth,
    operationOwner: { kind: 'local' }
  }
}

const folderNode = node('/repo/src', true)
const fileNode = node('/repo/src/index.ts', false, 1)

function setUserAgent(value: string): void {
  Object.defineProperty(navigator, 'userAgent', {
    value,
    configurable: true
  })
}

describe('file explorer paste', () => {
  const initialState = useAppStore.getInitialState()

  beforeEach(() => {
    vi.mocked(importFileExplorerExternalPaths).mockReset()
    useAppStore.setState(initialState, true)
    useAppStore.setState({
      rightSidebarOpen: true,
      rightSidebarTab: 'explorer',
      rightSidebarExplorerView: 'files',
      keybindings: {}
    })
    ;(globalThis as unknown as { window: typeof window }).window.api = {
      ...window.api,
      ui: {
        ...window.api?.ui,
        readClipboardFiles: vi.fn()
      }
    } as never
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('detects paste shortcuts with platform-specific modifiers', () => {
    expect(
      isFileExplorerPasteShortcut(
        new KeyboardEvent('keydown', { key: 'v', metaKey: true }),
        'Macintosh'
      )
    ).toBe(true)
    expect(
      isFileExplorerPasteShortcut(
        new KeyboardEvent('keydown', { key: 'v', ctrlKey: true }),
        'X11 Linux'
      )
    ).toBe(true)
    expect(
      isFileExplorerPasteShortcut(
        new KeyboardEvent('keydown', { key: 'v', metaKey: true }),
        'X11 Linux'
      )
    ).toBe(false)
  })

  it('prefers a focused folder as the paste destination', () => {
    expect(
      getFileExplorerPasteDestination({
        focusedNode: folderNode,
        selectedNode: null,
        worktreePath: '/repo'
      })
    ).toEqual({ dir: '/repo/src', operationOwner: { kind: 'local' } })
    expect(
      getFileExplorerPasteDestination({
        focusedNode: fileNode,
        selectedNode: null,
        worktreePath: '/repo'
      })
    ).toEqual({ dir: '/repo' })
  })

  it('imports clipboard files through the shared file explorer import path', async () => {
    const readClipboardFiles = vi.fn().mockResolvedValue(['/tmp/logo.png'])
    window.api.ui.readClipboardFiles = readClipboardFiles
    const refreshDir = vi.fn().mockResolvedValue(undefined)
    const setSelectedPath = vi.fn()
    const { result } = renderHook(() =>
      useFileExplorerPaste({
        worktreePath: '/repo',
        activeWorktreeId: 'wt-1',
        refreshDir,
        setSelectedPath,
        operationOwner: { kind: 'local' }
      })
    )

    act(() => result.current('/repo/src', { kind: 'local' }))

    await waitFor(() => expect(importFileExplorerExternalPaths).toHaveBeenCalledTimes(1))
    expect(importFileExplorerExternalPaths).toHaveBeenCalledWith({
      worktreeId: 'wt-1',
      worktreePath: '/repo',
      sourcePaths: ['/tmp/logo.png'],
      destinationDir: '/repo/src',
      refreshDir,
      setSelectedPath,
      operationOwner: { kind: 'local' }
    })
  })

  it('does not import when the clipboard has no files', async () => {
    window.api.ui.readClipboardFiles = vi.fn().mockResolvedValue([])
    const { result } = renderHook(() =>
      useFileExplorerPaste({
        worktreePath: '/repo',
        activeWorktreeId: 'wt-1',
        refreshDir: vi.fn(),
        setSelectedPath: vi.fn()
      })
    )

    act(() => result.current('/repo/src'))

    await waitFor(() => expect(window.api.ui.readClipboardFiles).toHaveBeenCalledTimes(1))
    expect(importFileExplorerExternalPaths).not.toHaveBeenCalled()
  })

  it('routes Cmd+V from a focused folder row to the paste callback', async () => {
    setUserAgent('Macintosh')
    const pasteToDir = vi.fn()
    const rowProjection = createFileExplorerRowProjection([folderNode, fileNode])

    function Probe(): React.JSX.Element {
      const containerRef = useRef<HTMLDivElement | null>(null)
      useFileExplorerKeys({
        containerRef,
        rowProjection,
        expandedPaths: new Set(),
        canToggleDirectories: true,
        inlineInput: null,
        selectedPaths: new Set(['/repo/src']),
        selectedNode: folderNode,
        activateNode: vi.fn(),
        moveSelection: vi.fn(),
        toggleDir: vi.fn(),
        startRename: vi.fn(),
        requestDelete: vi.fn(),
        requestDeleteAll: vi.fn(),
        scrollToIndex: vi.fn(),
        activeWorktreeId: 'wt-1',
        worktreePath: '/repo',
        onPasteToDir: pasteToDir
      })
      return (
        <div ref={containerRef} data-orca-explorer-shell>
          <div data-index="0">
            <button type="button">src</button>
          </div>
        </div>
      )
    }

    render(<Probe />)
    screen.getByRole('button', { name: 'src' }).focus()
    const event = new KeyboardEvent('keydown', {
      key: 'v',
      metaKey: true,
      bubbles: true,
      cancelable: true
    })
    window.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(pasteToDir).toHaveBeenCalledWith('/repo/src', { kind: 'local' })
  })

  it('background menu Paste invokes the supplied paste callback', async () => {
    const pasteToDir = vi.fn()
    render(
      <FileExplorerBackgroundMenu
        open
        onOpenChange={vi.fn()}
        point={{ x: 10, y: 20 }}
        worktreePath="/repo"
        onStartNew={vi.fn()}
        onPasteToDir={pasteToDir}
      />
    )

    fireEvent.click(await screen.findByText('Paste'))

    expect(pasteToDir).toHaveBeenCalledWith('/repo')
  })
})
