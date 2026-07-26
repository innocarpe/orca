import { describe, expect, it } from 'vitest'
import { normalizeOsc52ClipboardDefaultOn } from './osc52-clipboard-settings'

describe('normalizeOsc52ClipboardDefaultOn', () => {
  it('flips an unstamped profile on, because its `false` came from the old default', () => {
    // Why: every profile saved before #10567 persisted `false`, which the settings
    // merge then wins with — indistinguishable on disk from a deliberate opt-out.
    expect(normalizeOsc52ClipboardDefaultOn({ terminalAllowOsc52Clipboard: false })).toEqual({
      terminalAllowOsc52Clipboard: true,
      terminalAllowOsc52ClipboardDefaultedOnForAllUsers: true
    })
  })

  it('leaves a stamped opt-out off', () => {
    expect(
      normalizeOsc52ClipboardDefaultOn({
        terminalAllowOsc52Clipboard: false,
        terminalAllowOsc52ClipboardDefaultedOnForAllUsers: true
      })
    ).toEqual({
      terminalAllowOsc52Clipboard: false,
      terminalAllowOsc52ClipboardDefaultedOnForAllUsers: true
    })
  })

  it('defaults a fresh or absent profile on', () => {
    for (const settings of [
      undefined,
      {},
      { terminalAllowOsc52ClipboardDefaultedOnForAllUsers: true }
    ]) {
      expect(normalizeOsc52ClipboardDefaultOn(settings)).toEqual({
        terminalAllowOsc52Clipboard: true,
        terminalAllowOsc52ClipboardDefaultedOnForAllUsers: true
      })
    }
  })

  it('is idempotent, so a crash before the write-back cannot re-flip an opt-out', () => {
    const once = normalizeOsc52ClipboardDefaultOn({ terminalAllowOsc52Clipboard: false })
    expect(normalizeOsc52ClipboardDefaultOn(once)).toEqual(once)

    const optedOut = normalizeOsc52ClipboardDefaultOn({
      terminalAllowOsc52Clipboard: false,
      terminalAllowOsc52ClipboardDefaultedOnForAllUsers: true
    })
    expect(normalizeOsc52ClipboardDefaultOn(optedOut)).toEqual(optedOut)
  })
})
