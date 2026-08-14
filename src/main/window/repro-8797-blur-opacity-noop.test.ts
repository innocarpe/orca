/**
 * Issue #8797 — Window Blur + Background Opacity look like no-ops.
 *
 * Current main already requests Windows acrylic, but an opaque window fill
 * covers it. macOS vibrancy+transparent stays off (#8482).
 *
 * Re-run:
 *   pnpm exec vitest run --config config/vitest.config.ts \
 *     src/main/window/repro-8797-blur-opacity-noop.test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  composeActiveTerminalTheme,
  hexToRgba
} from '../../renderer/src/components/terminal-pane/terminal-appearance'
import { resolveMainWindowChromeOptions } from './main-window-chrome-options'

const createMainWindowSource = readFileSync(join(__dirname, 'createMainWindow.ts'), 'utf8')

describe('#8797 window blur + background opacity', () => {
  it('wires createMainWindow through resolveMainWindowChromeOptions', () => {
    expect(createMainWindowSource).toMatch(
      /const\s+\{\s*backgroundColor,\s*platformBlurOptions\s*\}\s*=\s*resolveMainWindowChromeOptions\s*\(/
    )
    expect(createMainWindowSource).toMatch(/\.\.\.platformBlurOptions/)
    expect(createMainWindowSource).toMatch(/needs a restart/)
    expect(createMainWindowSource).not.toMatch(
      /backgroundColor:\s*nativeTheme\.shouldUseDarkColors\s*\?\s*'#0a0a0a'\s*:\s*'#ffffff'/
    )
  })

  it('does not reintroduce macOS vibrancy or transparency (#8482)', () => {
    const chrome = resolveMainWindowChromeOptions({
      platform: 'darwin',
      blur: true,
      dark: true
    })
    expect(chrome.platformBlurOptions).toEqual({})
    expect(chrome.backgroundColor).toBe('#0a0a0a')
  })

  it('does not cover Windows acrylic with an opaque BrowserWindow fill', () => {
    const chrome = resolveMainWindowChromeOptions({
      platform: 'win32',
      blur: true,
      dark: true
    })
    expect(chrome.platformBlurOptions.backgroundMaterial).toBe('acrylic')
    expect(chrome.platformBlurOptions.transparent).toBe(true)
    expect(chrome.backgroundColor).toBe('#00000000')
  })

  it('still applies terminalBackgroundOpacity to the xterm theme rgba', () => {
    const theme = composeActiveTerminalTheme(
      { background: '#0a0a0a', foreground: '#ffffff' },
      { terminalBackgroundOpacity: 0.3 }
    )
    expect(theme.background).toBe(hexToRgba('#0a0a0a', 0.3))
    expect(theme.background).toBe('rgba(10, 10, 10, 0.3)')
  })

  it('allows a transparent terminal to sit on a non-opaque Windows fill under blur', () => {
    const fullyTransparentTerminal = composeActiveTerminalTheme(
      { background: '#0a0a0a' },
      { terminalBackgroundOpacity: 0 }
    )
    expect(fullyTransparentTerminal.background).toBe('rgba(10, 10, 10, 0)')
    const chrome = resolveMainWindowChromeOptions({
      platform: 'win32',
      blur: true,
      dark: true
    })
    expect(chrome.backgroundColor).toBe('#00000000')
  })
})
