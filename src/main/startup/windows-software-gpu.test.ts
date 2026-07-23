import { describe, expect, it, vi } from 'vitest'
import {
  WINDOWS_SOFTWARE_GPU_SWITCHES,
  applyWindowsSoftwareGpuFallback,
  isSoftwareGpuEnvRequested
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
