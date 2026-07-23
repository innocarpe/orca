/**
 * Windows software-GPU command-line path used when hardware acceleration is
 * unusable (broken drivers, headless virtual displays / Sunshine Zako, etc.).
 *
 * Why more than disable-gpu: on some virtual adapters Chromium still forks a
 * GPU child that STATUS_BREAKPOINT-crashes even under --disable-gpu. The only
 * combo known to reach ready is in-process GPU + ANGLE SwiftShader (#10093).
 */

export type SoftwareGpuCommandLineApp = {
  disableHardwareAcceleration: () => void
  commandLine: {
    appendSwitch: (switchName: string, value?: string) => void
  }
}

/** Chromium switches that form the proven software-render recovery path. */
export const WINDOWS_SOFTWARE_GPU_SWITCHES = [
  { name: 'disable-gpu' },
  { name: 'in-process-gpu' },
  { name: 'use-angle', value: 'swiftshader' }
] as const

/**
 * True when the operator forces software GPU before any crash burst
 * (headless / virtual-display hosts that never survive the first launch).
 */
export function isSoftwareGpuEnvRequested(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env.ORCA_SOFTWARE_GPU ?? '').trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes'
}

export function applyWindowsSoftwareGpuFallback(app: SoftwareGpuCommandLineApp): void {
  app.disableHardwareAcceleration()
  for (const flag of WINDOWS_SOFTWARE_GPU_SWITCHES) {
    if ('value' in flag && flag.value !== undefined) {
      app.commandLine.appendSwitch(flag.name, flag.value)
    } else {
      app.commandLine.appendSwitch(flag.name)
    }
  }
}
