import type { EditorSet } from '../types/editor-set-get'
import {
  type ClosedEditorTabSnapshot,
  MAX_RECENT_CLOSED_EDITOR_TABS,
  type OpenFile
} from '../types/open-file'
import {
  pushRecentlyClosedTabKind,
  type RecentlyClosedTabPosition
} from '../../recently-closed-tabs'

export function rememberKeptUntitledEditor(
  set: EditorSet,
  file: OpenFile,
  position: RecentlyClosedTabPosition | undefined
): void {
  if (!file.worktreeId || file.mode === 'markdown-preview') {
    return
  }
  const { id, isDirty: _dirty, mirroredFromRuntimeSession: _mirrored, ...snap } = file
  set((state) => {
    const stack = state.recentlyClosedEditorTabsByWorktree[file.worktreeId] ?? []
    if (stack.some((entry) => entry.reopenId === id)) {
      return state
    }
    return {
      recentlyClosedEditorTabsByWorktree: {
        ...state.recentlyClosedEditorTabsByWorktree,
        [file.worktreeId]: [
          {
            ...(snap as ClosedEditorTabSnapshot),
            reopenId: id,
            ...(position ? { position } : {})
          },
          ...stack
        ].slice(0, MAX_RECENT_CLOSED_EDITOR_TABS)
      },
      recentlyClosedTabKindsByWorktree: pushRecentlyClosedTabKind(
        state.recentlyClosedTabKindsByWorktree,
        file.worktreeId,
        'editor'
      )
    }
  })
}
