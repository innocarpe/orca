import { clipboard } from 'electron'

// Electron can silently leave the Windows clipboard unchanged under contention.
export function writeClipboardTextAndVerify(text: string): void {
  clipboard.writeText(text)
  if (clipboard.readText() !== text) {
    throw new Error('Clipboard write verification failed')
  }
}
