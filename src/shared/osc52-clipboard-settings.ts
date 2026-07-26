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

/** True when the migration is about to turn OSC 52 on over a persisted `false`.
 *  Why surface it: that `false` may have been a deliberate opt-out, and flipping a
 *  security posture back on without telling anyone is worse than the copy bug. */
export function osc52ClipboardDefaultOnFlipsPersistedOptOut(
  settings: Partial<Osc52ClipboardSettings> | undefined
): boolean {
  return (
    settings?.terminalAllowOsc52ClipboardDefaultedOnForAllUsers !== true &&
    settings?.terminalAllowOsc52Clipboard === false
  )
}
