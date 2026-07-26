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

/** How software GPU was selected for this process. */
export type SoftwareGpuFallbackSource = 'env' | 'marker'

export type SoftwareGpuFallbackNotice = {
  title: string
  message: string
  detail: string
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

/**
 * Whether to surface the one-shot software-GPU notice.
 * Marker path: first activation only (sticky until build change).
 * Env path: once per process — operators opted in explicitly.
 */
export function shouldPresentSoftwareGpuFallbackNotice(args: {
  active: boolean
  source: SoftwareGpuFallbackSource | null
  alreadyPresentedThisSession: boolean
  /** Set when the sticky crash-marker already recorded a prior notice. */
  markerAlreadyNotified: boolean
}): boolean {
  if (!args.active || args.source === null || args.alreadyPresentedThisSession) {
    return false
  }
  if (args.source === 'marker' && args.markerAlreadyNotified) {
    return false
  }
  return true
}

export function buildSoftwareGpuFallbackNotice(
  source: SoftwareGpuFallbackSource
): SoftwareGpuFallbackNotice {
  if (source === 'env') {
    return {
      title: 'Software GPU is active',
      message: 'Orca is using software graphics for stability.',
      detail:
        'ORCA_SOFTWARE_GPU is set, so Orca is rendering with ANGLE SwiftShader instead of the hardware GPU. This is slower but more reliable on virtual or remote displays. Unset the variable and restart to try hardware graphics again.'
    }
  }
  return {
    title: 'Software GPU is active',
    message: 'Orca switched to software graphics after unstable hardware GPU crashes.',
    detail:
      'Rendering uses ANGLE SwiftShader so the app can stay usable on this display. It may feel slower. This mode stays on for this app version; updating Orca will try hardware graphics again automatically.'
  }
}
