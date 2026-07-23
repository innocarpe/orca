/**
 * BrowserWindow chrome options that interact with platform blur materials.
 *
 * Why: an always-opaque `backgroundColor` paints over macOS vibrancy / Windows
 * acrylic, so Window Blur + terminal Background Opacity look like no-ops (#8797).
 */

export type MainWindowChromeOptions = {
  backgroundColor: string
  /** Spread into BrowserWindow constructor (platform-specific blur keys only). */
  platformBlurOptions: {
    vibrancy?: 'under-window'
    visualEffectState?: 'active'
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

  if (input.platform === 'darwin') {
    return {
      // Why: fully transparent fill lets vibrancy show through when the terminal
      // theme alpha drops below 1; solid #0a0a0a/#ffffff covered it completely.
      backgroundColor: '#00000000',
      platformBlurOptions: {
        vibrancy: 'under-window',
        // Why: keep the material active while the window is focused so blur
        // does not freeze as a static snapshot under Electron's default policy.
        visualEffectState: 'active',
        transparent: true
      }
    }
  }

  if (input.platform === 'win32') {
    return {
      backgroundColor: '#00000000',
      platformBlurOptions: {
        backgroundMaterial: 'acrylic'
      }
    }
  }

  // Linux has no supported blur material — keep the solid chrome fill.
  return {
    backgroundColor: opaqueBackground,
    platformBlurOptions: {}
  }
}
