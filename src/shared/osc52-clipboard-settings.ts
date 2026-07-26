import type { GlobalSettings } from './types'

type Osc52ClipboardSettings = Pick<
  GlobalSettings,
  'terminalAllowOsc52Clipboard' | 'terminalAllowOsc52ClipboardDefaultedOnForAllUsers'
>

export function normalizeOsc52ClipboardDefaultOn(
  settings: Partial<Osc52ClipboardSettings> | undefined
): Osc52ClipboardSettings {
  const defaultedOn = settings?.terminalAllowOsc52ClipboardDefaultedOnForAllUsers === true

  return {
    // Why: profiles saved under the old off default persisted `false`, which is
    // indistinguishable from a real opt-out; only stamped profiles can express one.
    terminalAllowOsc52Clipboard: defaultedOn
      ? (settings?.terminalAllowOsc52Clipboard ?? true)
      : true,
    terminalAllowOsc52ClipboardDefaultedOnForAllUsers: true
  }
}
