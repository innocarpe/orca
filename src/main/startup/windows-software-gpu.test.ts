import { describe, expect, it, vi } from 'vitest'
import {
  WINDOWS_SOFTWARE_GPU_SWITCHES,
  applyWindowsSoftwareGpuFallback,
  buildSoftwareGpuFallbackNotice,
  isSoftwareGpuEnvRequested,
  shouldPresentSoftwareGpuFallbackNotice
} from './windows-software-gpu'

function createAppMock() {
  return {
    disableHardwareAcceleration: vi.fn(),
    commandLine: {
      appendSwitch: vi.fn()
    }
  }
}

describe('isSoftwareGpuEnvRequested', () => {
  it('accepts common truthy ORCA_SOFTWARE_GPU values', () => {
    expect(isSoftwareGpuEnvRequested({ ORCA_SOFTWARE_GPU: '1' })).toBe(true)
    expect(isSoftwareGpuEnvRequested({ ORCA_SOFTWARE_GPU: 'true' })).toBe(true)
    expect(isSoftwareGpuEnvRequested({ ORCA_SOFTWARE_GPU: 'YES' })).toBe(true)
    expect(isSoftwareGpuEnvRequested({ ORCA_SOFTWARE_GPU: ' 1 ' })).toBe(true)
  })

  it('rejects missing or non-truthy values', () => {
    expect(isSoftwareGpuEnvRequested({})).toBe(false)
    expect(isSoftwareGpuEnvRequested({ ORCA_SOFTWARE_GPU: '0' })).toBe(false)
    expect(isSoftwareGpuEnvRequested({ ORCA_SOFTWARE_GPU: 'false' })).toBe(false)
    expect(isSoftwareGpuEnvRequested({ ORCA_SOFTWARE_GPU: '' })).toBe(false)
  })
})

describe('applyWindowsSoftwareGpuFallback', () => {
  it('disables hardware acceleration and applies the #10093 software combo', () => {
    const app = createAppMock()
    applyWindowsSoftwareGpuFallback(app)

    expect(app.disableHardwareAcceleration).toHaveBeenCalledTimes(1)
    expect(app.commandLine.appendSwitch).toHaveBeenCalledWith('disable-gpu')
    expect(app.commandLine.appendSwitch).toHaveBeenCalledWith('in-process-gpu')
    expect(app.commandLine.appendSwitch).toHaveBeenCalledWith('use-angle', 'swiftshader')
  })

  it('covers every documented software switch exactly once', () => {
    const app = createAppMock()
    applyWindowsSoftwareGpuFallback(app)

    expect(WINDOWS_SOFTWARE_GPU_SWITCHES.map((s) => s.name)).toEqual([
      'disable-gpu',
      'in-process-gpu',
      'use-angle'
    ])
    expect(app.commandLine.appendSwitch).toHaveBeenCalledTimes(WINDOWS_SOFTWARE_GPU_SWITCHES.length)
  })
})

describe('shouldPresentSoftwareGpuFallbackNotice', () => {
  it('presents for env source once per session', () => {
    expect(
      shouldPresentSoftwareGpuFallbackNotice({
        active: true,
        source: 'env',
        alreadyPresentedThisSession: false,
        markerAlreadyNotified: false
      })
    ).toBe(true)
    expect(
      shouldPresentSoftwareGpuFallbackNotice({
        active: true,
        source: 'env',
        alreadyPresentedThisSession: true,
        markerAlreadyNotified: false
      })
    ).toBe(false)
  })

  it('presents marker fallback only on first activation', () => {
    expect(
      shouldPresentSoftwareGpuFallbackNotice({
        active: true,
        source: 'marker',
        alreadyPresentedThisSession: false,
        markerAlreadyNotified: false
      })
    ).toBe(true)
    expect(
      shouldPresentSoftwareGpuFallbackNotice({
        active: true,
        source: 'marker',
        alreadyPresentedThisSession: false,
        markerAlreadyNotified: true
      })
    ).toBe(false)
  })

  it('skips when fallback is inactive or source is missing', () => {
    expect(
      shouldPresentSoftwareGpuFallbackNotice({
        active: false,
        source: 'marker',
        alreadyPresentedThisSession: false,
        markerAlreadyNotified: false
      })
    ).toBe(false)
    expect(
      shouldPresentSoftwareGpuFallbackNotice({
        active: true,
        source: null,
        alreadyPresentedThisSession: false,
        markerAlreadyNotified: false
      })
    ).toBe(false)
  })
})

describe('buildSoftwareGpuFallbackNotice', () => {
  it('explains env opt-in and crash-marker recovery distinctly', () => {
    const envNotice = buildSoftwareGpuFallbackNotice('env')
    expect(envNotice.title).toMatch(/software gpu/i)
    expect(envNotice.detail).toContain('ORCA_SOFTWARE_GPU')

    const markerNotice = buildSoftwareGpuFallbackNotice('marker')
    expect(markerNotice.message).toMatch(/unstable hardware gpu/i)
    expect(markerNotice.detail).toMatch(/this app version/i)
  })
})
