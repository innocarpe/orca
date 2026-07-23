import { isTerminalBackgroundLight } from '@/lib/terminal-title-contrast'

// xterm minimumContrastRatio tuning (#7934 / #9599 / #10104).
// - Light backgrounds keep WCAG-AA 4.5 so invisible white/bright-white ANSI body text stays readable.
// - Dark backgrounds use a milder floor: fully disabling correction (1) left near-background body
//   text unreadable (Antigravity dark-on-dark, #10104), while 4.5 over-brightened vibrant ANSI.
export const LIGHT_BG_MIN_CONTRAST = 4.5
export const DARK_BG_MIN_CONTRAST = 3

// Why gate by background luminance, not app mode (#7934): either theme slot can hold either kind of
// theme (match-dark-mode, or a light theme in the dark slot), so follow the composed background.
export function resolveTerminalMinimumContrastRatio(
  background: string | undefined,
  appSurface: 'dark' | 'light'
): number {
  return isTerminalBackgroundLight(background, { appSurface })
    ? LIGHT_BG_MIN_CONTRAST
    : DARK_BG_MIN_CONTRAST
}
