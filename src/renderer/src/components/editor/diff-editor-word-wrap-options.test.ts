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
  function fakeDiffEditor(): {
    diffEditor: editor.IStandaloneDiffEditor
    original: { updateOptions: ReturnType<typeof vi.fn> }
    modified: { updateOptions: ReturnType<typeof vi.fn> }
  } {
    const original = { updateOptions: vi.fn() }
    const modified = { updateOptions: vi.fn() }
    return {
      original,
      modified,
      diffEditor: {
        getOriginalEditor: () => original,
        getModifiedEditor: () => modified
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
})
