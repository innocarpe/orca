import type { GlobalSettings, TerminalColorOverrides } from './types'

export type TerminalColorOverrideSettings = Pick<
  GlobalSettings,
  | 'terminalColorOverrides'
  | 'terminalColorOverridesDark'
  | 'terminalColorOverridesLight'
  | 'terminalUseSeparateLightTheme'
>

export type TerminalColorOverrideMode = 'dark' | 'light'

export function hasPerModeTerminalColorOverrides(settings: TerminalColorOverrideSettings): boolean {
  return (
    settings.terminalColorOverridesDark !== undefined ||
    settings.terminalColorOverridesLight !== undefined
  )
}

function compactOverrides(overrides: TerminalColorOverrides): TerminalColorOverrides | undefined {
  return Object.keys(overrides).length > 0 ? overrides : undefined
}

function cloneOverrides(overrides: TerminalColorOverrides | undefined): TerminalColorOverrides {
  return overrides ? { ...overrides } : {}
}

/**
 * Resolve which color-override bag applies for a terminal appearance mode.
 *
 * - Legacy single `terminalColorOverrides` still covers both modes until the
 *   user edits a mode-specific bag.
 * - When light mode "matches dark", light terminals use the dark bag.
 */
export function resolveTerminalColorOverridesForMode(
  settings: TerminalColorOverrideSettings,
  mode: TerminalColorOverrideMode
): TerminalColorOverrides | undefined {
  const effectiveMode: TerminalColorOverrideMode =
    mode === 'light' && !settings.terminalUseSeparateLightTheme ? 'dark' : mode

  if (hasPerModeTerminalColorOverrides(settings)) {
    return effectiveMode === 'light'
      ? settings.terminalColorOverridesLight
      : settings.terminalColorOverridesDark
  }
  return settings.terminalColorOverrides
}

/**
 * First dual-mode edit seeds only the target mode from the legacy bag so the
 * other mode starts clean (fixes shared-override bleed across light/dark).
 */
export function updateTerminalColorOverrideKey(
  settings: TerminalColorOverrideSettings,
  mode: TerminalColorOverrideMode,
  key: keyof TerminalColorOverrides,
  value: string | undefined
): Partial<GlobalSettings> {
  if (!hasPerModeTerminalColorOverrides(settings)) {
    const seeded = cloneOverrides(settings.terminalColorOverrides)
    if (value) {
      seeded[key] = value
    } else {
      delete seeded[key]
    }
    return {
      terminalColorOverrides: undefined,
      terminalColorOverridesDark: mode === 'dark' ? compactOverrides(seeded) : undefined,
      terminalColorOverridesLight: mode === 'light' ? compactOverrides(seeded) : undefined
    }
  }

  const bag = cloneOverrides(
    mode === 'light' ? settings.terminalColorOverridesLight : settings.terminalColorOverridesDark
  )
  if (value) {
    bag[key] = value
  } else {
    delete bag[key]
  }
  return mode === 'light'
    ? { terminalColorOverridesLight: compactOverrides(bag) }
    : { terminalColorOverridesDark: compactOverrides(bag) }
}

/** Merge an imported palette into the dark bag (or legacy when still shared). */
export function mergeImportedTerminalColorOverrides(
  settings: TerminalColorOverrideSettings,
  imported: TerminalColorOverrides
): Partial<GlobalSettings> {
  if (!hasPerModeTerminalColorOverrides(settings)) {
    return {
      terminalColorOverrides: {
        ...settings.terminalColorOverrides,
        ...imported
      }
    }
  }
  return {
    terminalColorOverridesDark: {
      ...settings.terminalColorOverridesDark,
      ...imported
    }
  }
}

export function resetTerminalColorOverridesForMode(
  settings: TerminalColorOverrideSettings,
  mode: TerminalColorOverrideMode
): Partial<GlobalSettings> {
  if (!hasPerModeTerminalColorOverrides(settings)) {
    // Legacy bag was shared; clear only the edited mode and leave the other
    // mode without overrides so light/dark no longer share the old values.
    return {
      terminalColorOverrides: undefined,
      terminalColorOverridesDark: mode === 'dark' ? undefined : settings.terminalColorOverrides,
      terminalColorOverridesLight: mode === 'light' ? undefined : settings.terminalColorOverrides
    }
  }
  return mode === 'light'
    ? { terminalColorOverridesLight: undefined }
    : { terminalColorOverridesDark: undefined }
}
