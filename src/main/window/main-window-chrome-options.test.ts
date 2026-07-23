import { describe, expect, it } from 'vitest'
import { resolveMainWindowChromeOptions } from './main-window-chrome-options'

describe('resolveMainWindowChromeOptions (#8797)', () => {
  it('keeps an opaque chrome fill when blur is off', () => {
    expect(
      resolveMainWindowChromeOptions({ platform: 'darwin', blur: false, dark: true })
    ).toEqual({
      backgroundColor: '#0a0a0a',
      platformBlurOptions: {}
    })
    expect(
      resolveMainWindowChromeOptions({ platform: 'darwin', blur: false, dark: false })
    ).toEqual({
      backgroundColor: '#ffffff',
      platformBlurOptions: {}
    })
  })

  it('uses a transparent fill + vibrancy when macOS blur is on', () => {
    expect(
      resolveMainWindowChromeOptions({ platform: 'darwin', blur: true, dark: true })
    ).toEqual({
      backgroundColor: '#00000000',
      platformBlurOptions: {
        vibrancy: 'under-window',
        visualEffectState: 'active',
        transparent: true
      }
    })
  })

  it('uses a transparent fill + acrylic when Windows blur is on', () => {
    expect(
      resolveMainWindowChromeOptions({ platform: 'win32', blur: true, dark: false })
    ).toEqual({
      backgroundColor: '#00000000',
      platformBlurOptions: {
        backgroundMaterial: 'acrylic'
      }
    })
  })

  it('does not invent a blur material on Linux', () => {
    expect(
      resolveMainWindowChromeOptions({ platform: 'linux', blur: true, dark: true })
    ).toEqual({
      backgroundColor: '#0a0a0a',
      platformBlurOptions: {}
    })
  })
})
