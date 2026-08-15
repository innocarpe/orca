import { systemPreferences } from 'electron'

export const APPLE_PRESS_AND_HOLD_ENABLED_KEY = 'ApplePressAndHoldEnabled'

export function disableApplePressAndHold(): void {
  if (process.platform !== 'darwin') {
    return
  }
  // Why: Chromium reads this from NSUserDefaults, not Info.plist. Writing the
  // app-domain default is the shipped equivalent of
  // `defaults write com.stablyai.orca ApplePressAndHoldEnabled -bool false` (#14746).
  systemPreferences.setUserDefault(APPLE_PRESS_AND_HOLD_ENABLED_KEY, 'boolean', false)
}
