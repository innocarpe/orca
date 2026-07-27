import { clipboard } from 'electron'

// Why: Electron's clipboard.writeText returns without throwing even when the OS
// clipboard keeps its previous contents (observed on Windows with TUI/agent
// copies), so a renderer "Copied" success state can be a lie. Read the value
// back so a successful write actually means pasteable content (#8977 / #5611).
export function writeClipboardTextAndVerify(text: string, clipboardType?: 'selection'): void {
  if (clipboardType) {
    clipboard.writeText(text, clipboardType)
  } else {
    clipboard.writeText(text)
  }
  // Why: only verify the standard clipboard. The X11 PRIMARY "selection"
  // clipboard hands ownership to whoever last selected text, so a read-back can
  // legitimately differ from what we just wrote — verifying it would surface
  // false failures on Linux primary-selection copies.
  if (clipboardType === 'selection') {
    return
  }
  if (clipboard.readText() !== text) {
    throw new Error('Clipboard write verification failed')
  }
}
