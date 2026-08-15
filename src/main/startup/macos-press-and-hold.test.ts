import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { setUserDefault } = vi.hoisted(() => ({
  setUserDefault: vi.fn()
}))

vi.mock('electron', () => ({
  systemPreferences: {
    setUserDefault
  }
}))

import { APPLE_PRESS_AND_HOLD_ENABLED_KEY, disableApplePressAndHold } from './macos-press-and-hold'

const require = createRequire(import.meta.url)
const electronBuilderConfig = require('../../../config/electron-builder.config.cjs') as {
  appId: string
  mac: { extendInfo: { ApplePressAndHoldEnabled?: unknown } }
}

describe('disableApplePressAndHold', () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')

  function setPlatform(platform: NodeJS.Platform): void {
    Object.defineProperty(process, 'platform', {
      configurable: true,
      value: platform
    })
  }

  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform)
    }
    setUserDefault.mockReset()
  })

  it('writes ApplePressAndHoldEnabled false on macOS so held keys repeat', () => {
    setPlatform('darwin')
    disableApplePressAndHold()
    expect(setUserDefault).toHaveBeenCalledWith(APPLE_PRESS_AND_HOLD_ENABLED_KEY, 'boolean', false)
  })

  it('does not touch user defaults on other platforms', () => {
    setPlatform('linux')
    disableApplePressAndHold()
    expect(setUserDefault).not.toHaveBeenCalled()
  })

  it('ships the same override in the packaged macOS Info.plist', () => {
    expect(electronBuilderConfig.appId).toBe('com.stablyai.orca')
    expect(electronBuilderConfig.mac.extendInfo.ApplePressAndHoldEnabled).toBe(false)
  })

  it('is invoked from main-process startup before windows exist', () => {
    const source = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')
    expect(source).toContain('disableApplePressAndHold()')
    const callIndex = source.indexOf('disableApplePressAndHold()')
    const windowIndex = source.indexOf('openMainWindow()')
    expect(callIndex).toBeGreaterThanOrEqual(0)
    expect(windowIndex).toBeGreaterThan(callIndex)
  })
})
