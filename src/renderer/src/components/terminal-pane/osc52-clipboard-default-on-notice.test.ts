import { describe, expect, it } from 'vitest'
import { shouldShowOsc52ClipboardDefaultOnNotice } from './osc52-clipboard-default-on-notice'

describe('shouldShowOsc52ClipboardDefaultOnNotice', () => {
  it('shows once the migrating profile has hydrated', () => {
    expect(
      shouldShowOsc52ClipboardDefaultOnNotice({ persistedUIReady: true, noticePending: true })
    ).toBe(true)
  })

  it('stays quiet before hydration, when the flag still reads its default', () => {
    // Why: pre-hydration the store holds `false` for everyone, so firing on that
    // value would nag every profile — including the ones never opted out.
    expect(
      shouldShowOsc52ClipboardDefaultOnNotice({ persistedUIReady: false, noticePending: true })
    ).toBe(false)
    expect(
      shouldShowOsc52ClipboardDefaultOnNotice({ persistedUIReady: false, noticePending: false })
    ).toBe(false)
  })

  it('stays quiet for a profile the migration did not override', () => {
    expect(
      shouldShowOsc52ClipboardDefaultOnNotice({ persistedUIReady: true, noticePending: false })
    ).toBe(false)
  })
})
