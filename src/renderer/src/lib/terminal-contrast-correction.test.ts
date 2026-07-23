import { describe, expect, it } from 'vitest'
import {
  DARK_BG_MIN_CONTRAST,
  LIGHT_BG_MIN_CONTRAST,
  resolveTerminalMinimumContrastRatio
} from './terminal-contrast-correction'

describe('resolveTerminalMinimumContrastRatio', () => {
  it('keeps WCAG-AA correction on light terminal backgrounds', () => {
    expect(resolveTerminalMinimumContrastRatio('#ffffff', 'light')).toBe(LIGHT_BG_MIN_CONTRAST)
    expect(resolveTerminalMinimumContrastRatio('#f8f8f8', 'dark')).toBe(LIGHT_BG_MIN_CONTRAST)
  })

  it('applies the dark-background contrast floor (#10104 Antigravity dark-on-dark)', () => {
    // Report colors from #10104: body #262b30 on bg #1e242a is ~1.1:1 without correction.
    expect(resolveTerminalMinimumContrastRatio('#1e242a', 'dark')).toBe(DARK_BG_MIN_CONTRAST)
    expect(resolveTerminalMinimumContrastRatio('#1e242a', 'light')).toBe(DARK_BG_MIN_CONTRAST)
    expect(DARK_BG_MIN_CONTRAST).toBeGreaterThan(1)
    expect(DARK_BG_MIN_CONTRAST).toBeLessThan(LIGHT_BG_MIN_CONTRAST)
  })
})
