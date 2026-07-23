/** Window event used to open the mounted "Send notes to an agent" picker from a keybinding. */
export const OPEN_NOTES_SEND_MENU_EVENT = 'orca:open-notes-send-menu'

export type OpenNotesSendMenuDetail = {
  worktreeId?: string | null
}

// Why: listeners run synchronously; the shortcut installer needs to know whether
// any mounted menu accepted the request so it can preventDefault only then.
let openRequestAccepted = false

export function markNotesSendMenuOpenAccepted(): void {
  openRequestAccepted = true
}

/** Returns true if a mounted NotesSendMenu with deliverable notes opened. */
export function requestOpenNotesSendMenu(detail: OpenNotesSendMenuDetail = {}): boolean {
  openRequestAccepted = false
  window.dispatchEvent(
    new CustomEvent<OpenNotesSendMenuDetail>(OPEN_NOTES_SEND_MENU_EVENT, { detail })
  )
  return openRequestAccepted
}
