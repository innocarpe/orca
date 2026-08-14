/**
 * BrowserWindow chrome options that interact with platform blur materials.
 *
 * Why: Windows acrylic is already requested when Window Blur is on, but an
 * always-opaque `backgroundColor` covers it so the setting looks like a no-op
 * (#8797). macOS vibrancy+transparent stays off — that combination was an
 * invisible GPU cost (#8482).
 */

export type MainWindowChromeOptions = {
  backgroundColor: string
  /** Spread into BrowserWindow constructor (platform-specific blur keys only). */
  platformBlurOptions: {
    transparent?: boolean
    backgroundMaterial?: 'acrylic'
  }
}

export function resolveMainWindowChromeOptions(input: {
  platform: NodeJS.Platform
  blur: boolean
  dark: boolean
}): MainWindowChromeOptions {
  const opaqueBackground = input.dark ? '#0a0a0a' : '#ffffff'

  if (!input.blur) {
    return {
      backgroundColor: opaqueBackground,
      platformBlurOptions: {}
    }
  }

  if (input.platform === 'win32') {
    return {
      // Why: Electron only honors #AARRGGBB alpha when `transparent` is true;
      // omitting backgroundColor defaults to opaque #FFF and still covers acrylic.
      backgroundColor: '#00000000',
      platformBlurOptions: {
        transparent: true,
        backgroundMaterial: 'acrylic'
      }
    }
  }

  // Why: macOS has no visible material without reintroducing #8482; Linux has none.
  return {
    backgroundColor: opaqueBackground,
    platformBlurOptions: {}
  }
}
