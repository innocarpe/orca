import { describe, expect, it, vi } from 'vitest'
import type { editor } from 'monaco-editor'
import {
  buildDiffEditorWordWrapOptions,
  syncDiffEditorOriginalWordWrap
} from './diff-editor-word-wrap-options'

describe('buildDiffEditorWordWrapOptions', () => {
  it('keeps long diff lines unwrapped by default', () => {
    expect(buildDiffEditorWordWrapOptions(undefined)).toEqual({
      wordWrap: 'off',
      diffWordWrap: 'off'
    })
    expect(buildDiffEditorWordWrapOptions(false)).toEqual({
      wordWrap: 'off',
      diffWordWrap: 'off'
    })
  })

  it('enables Monaco diff word wrapping on both panes when the diff preference is on', () => {
    expect(buildDiffEditorWordWrapOptions(true)).toEqual({
      wordWrap: 'on',
      diffWordWrap: 'on'
    })
  })
})

describe('syncDiffEditorOriginalWordWrap', () => {
  function fakeEditor(): {
    updateOptions: ReturnType<typeof vi.fn>
    getRawOptions: () => editor.IEditorOptions
    onDidChangeConfiguration: (listener: () => void) => { dispose: () => void }
    emitDidChangeConfiguration: () => void
  } {
    const listeners = new Set<() => void>()
    let options: editor.IEditorOptions = {}
    const editorStub = {
      updateOptions: vi.fn((next: editor.IEditorOptions) => {
        options = { ...options, ...next }
      }),
      getRawOptions: () => options,
      onDidChangeConfiguration: (listener: () => void) => {
        listeners.add(listener)
        return {
          dispose: () => {
            listeners.delete(listener)
          }
        }
      },
      emitDidChangeConfiguration: () => {
        listeners.forEach((listener) => listener())
      }
    }
    return editorStub
  }

  function monacoDiffHost(sideBySide: boolean): {
    classList: { contains: (name: string) => boolean }
    querySelector: (selector: string) => { classList: { contains: (name: string) => boolean } }
  } {
    const widget = {
      classList: {
        contains: (name: string) =>
          name === 'monaco-diff-editor' || (sideBySide && name === 'side-by-side')
      }
    }
    return {
      classList: { contains: () => false },
      querySelector: (selector: string) => {
        if (selector !== '.monaco-diff-editor') {
          throw new Error(`unexpected selector ${selector}`)
        }
        return widget
      }
    }
  }

  function fakeDiffEditor(root?: {
    classList: { contains: (name: string) => boolean }
    querySelector?: (selector: string) => { classList: { contains: (name: string) => boolean } }
  }): {
    diffEditor: editor.IStandaloneDiffEditor
    original: ReturnType<typeof fakeEditor>
    modified: ReturnType<typeof fakeEditor>
  } {
    const original = fakeEditor()
    const modified = fakeEditor()
    return {
      original,
      modified,
      diffEditor: {
        getOriginalEditor: () => original,
        getModifiedEditor: () => modified,
        ...(root ? { getContainerDomNode: () => root } : {})
      } as unknown as editor.IStandaloneDiffEditor
    }
  }

  it('clears the original pane override that stays off after Monaco leaves inline layout', () => {
    const { diffEditor, original, modified } = fakeDiffEditor()

    syncDiffEditorOriginalWordWrap(diffEditor, true)

    expect(original.updateOptions).toHaveBeenCalledWith({
      wordWrap: 'on',
      wordWrapOverride2: 'inherit'
    })
    expect(modified.updateOptions).toHaveBeenCalledWith({ wordWrap: 'on' })
  })

  it('keeps both panes unwrapped when the preference is off', () => {
    const { diffEditor, original, modified } = fakeDiffEditor()

    syncDiffEditorOriginalWordWrap(diffEditor, false)

    expect(original.updateOptions).toHaveBeenCalledWith({
      wordWrap: 'off',
      wordWrapOverride2: 'off'
    })
    expect(modified.updateOptions).toHaveBeenCalledWith({ wordWrap: 'off' })
  })

  it('reapplies the original pane wrap after Monaco clears it, and stops after dispose', async () => {
    const root = monacoDiffHost(true)
    expect(root.classList.contains('side-by-side')).toBe(false)
    const { diffEditor, original } = fakeDiffEditor(root)
    const disposable = syncDiffEditorOriginalWordWrap(diffEditor, true)
    original.updateOptions.mockClear()

    original.updateOptions({ wordWrapOverride2: 'off' })
    original.emitDidChangeConfiguration()
    await Promise.resolve()

    expect(original.getRawOptions().wordWrapOverride2).toBe('inherit')

    original.updateOptions.mockClear()
    disposable.dispose()
    original.updateOptions({ wordWrapOverride2: 'off' })
    original.emitDidChangeConfiguration()
    await Promise.resolve()

    expect(original.getRawOptions().wordWrapOverride2).toBe('off')
    expect(original.updateOptions).toHaveBeenCalledTimes(1)
  })

  it('leaves the hidden original pane unwrapped while Monaco is inline', async () => {
    const root = monacoDiffHost(false)
    const { diffEditor, original } = fakeDiffEditor(root)

    syncDiffEditorOriginalWordWrap(diffEditor, true)

    expect(original.getRawOptions().wordWrapOverride2).toBe('off')

    original.updateOptions({ wordWrapOverride2: 'inherit' })
    original.emitDidChangeConfiguration()
    await Promise.resolve()

    expect(original.getRawOptions().wordWrapOverride2).toBe('off')
  })
})
