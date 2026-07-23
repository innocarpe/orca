/**
 * Issue #8797 — Background Opacity + Window Blur have no visible effect on macOS.
 *
 * Before: createMainWindow painted an always-opaque solid `backgroundColor`
 * even when blur enabled vibrancy+transparent, covering the blur layer so
 * terminalBackgroundOpacity only revealed that solid fill.
 *
 * After: resolveMainWindowChromeOptions uses a transparent window fill when
 * blur materials are active so lowered terminal alpha can reveal vibrancy.
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

describe('#8797 macOS window blur + background opacity', () => {
  it('wires createMainWindow through resolveMainWindowChromeOptions', () => {
    expect(createMainWindowSource).toMatch(/resolveMainWindowChromeOptions/)
    expect(createMainWindowSource).toMatch(/only applies at creation/)
    expect(createMainWindowSource).toMatch(/requires a restart/)
    // No longer hard-codes an always-opaque fill next to the constructor.
    expect(createMainWindowSource).not.toMatch(
      /backgroundColor:\s*nativeTheme\.shouldUseDarkColors\s*\?\s*'#0a0a0a'\s*:\s*'#ffffff'/
    )
  })

  it('does not cover macOS vibrancy with an opaque BrowserWindow fill', () => {
    const chrome = resolveMainWindowChromeOptions({
      platform: 'darwin',
      blur: true,
      dark: true
    })
    expect(chrome.platformBlurOptions.vibrancy).toBe('under-window')
    expect(chrome.platformBlurOptions.transparent).toBe(true)
    expect(chrome.platformBlurOptions.visualEffectState).toBe('active')
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

  it('allows a transparent terminal to sit on a non-opaque window fill under blur', () => {
    const fullyTransparentTerminal = composeActiveTerminalTheme(
      { background: '#0a0a0a' },
      { terminalBackgroundOpacity: 0 }
    )
    expect(fullyTransparentTerminal.background).toBe('rgba(10, 10, 10, 0)')
    const chrome = resolveMainWindowChromeOptions({
      platform: 'darwin',
      blur: true,
      dark: true
    })
    // Fully transparent xterm + transparent window fill ⇒ desktop/vibrancy can show.
    expect(chrome.backgroundColor).toMatch(/00$|#00000000/i)
  })
})
