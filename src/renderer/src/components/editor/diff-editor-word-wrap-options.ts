import type { editor } from 'monaco-editor'

export function diffEditorWordWrapMode(diffWordWrap: boolean | undefined): 'on' | 'off' {
  return diffWordWrap === true ? 'on' : 'off'
}

export function buildDiffEditorWordWrapOptions(
  diffWordWrap: boolean | undefined
): Pick<editor.IStandaloneDiffEditorConstructionOptions, 'wordWrap' | 'diffWordWrap'> {
  const wrap = diffEditorWordWrapMode(diffWordWrap)
  return {
    wordWrap: wrap,
    // Why: `wordWrap` alone reaches the modified pane; the original pane follows `diffWordWrap`.
    diffWordWrap: wrap
  }
}

export function syncDiffEditorOriginalWordWrap(
  diffEditor: editor.IStandaloneDiffEditor,
  diffWordWrap: boolean | undefined
): void {
  const wrap = diffEditorWordWrapMode(diffWordWrap)
  // Why: Monaco's narrow inline fallback sets the original pane's wordWrapOverride2 to off and never clears it (#24199).
  diffEditor.getOriginalEditor().updateOptions({
    wordWrap: wrap,
    wordWrapOverride2: wrap === 'on' ? 'inherit' : 'off'
  })
  diffEditor.getModifiedEditor().updateOptions({ wordWrap: wrap })
}
