import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Persisted "disable hardware acceleration for this build" marker.
 *
 * Why a standalone file (not the Store): app.disableHardwareAcceleration() must
 * be called before app.whenReady() resolves, but the settings Store is only
 * constructed inside whenReady. A tiny JSON marker in userData can be read
 * synchronously during early startup, mirroring windows-user-data-acl.ts.
 */

export const GPU_FALLBACK_MARKER_FILE = 'gpu-fallback.json'
export const GPU_FALLBACK_SCHEME_VERSION = 2

export type GpuFallbackEnvironment = {
  appVersion: string
  electronVersion: string
  platform: NodeJS.Platform
}

export type WindowsGpuFallbackEnvironment = GpuFallbackEnvironment & { platform: 'win32' }

export type GpuFallbackMarker = {
  schemeVersion: number
  engagedAt: number
  crashesInWindow: number
  appVersion: string
  electronVersion: string
  platform: 'win32'
  /** When set, the user was already told software GPU is active for this marker. */
  userNotifiedAt?: number
}

function markerPath(userDataPath: string): string {
  return join(userDataPath, GPU_FALLBACK_MARKER_FILE)
}

function readOptionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function readGpuFallbackMarker(userDataPath: string): GpuFallbackMarker | null {
  try {
    const parsed = JSON.parse(readFileSync(markerPath(userDataPath), 'utf-8')) as Partial<
      Record<keyof GpuFallbackMarker, unknown>
    >
    if (parsed.schemeVersion !== GPU_FALLBACK_SCHEME_VERSION) {
      return null
    }
    if (
      typeof parsed.engagedAt !== 'number' ||
      !Number.isFinite(parsed.engagedAt) ||
      typeof parsed.crashesInWindow !== 'number' ||
      !Number.isFinite(parsed.crashesInWindow) ||
      typeof parsed.appVersion !== 'string' ||
      typeof parsed.electronVersion !== 'string' ||
      parsed.platform !== 'win32'
    ) {
      return null
    }
    const userNotifiedAt = readOptionalFiniteNumber(parsed.userNotifiedAt)
    return {
      schemeVersion: GPU_FALLBACK_SCHEME_VERSION,
      engagedAt: parsed.engagedAt,
      crashesInWindow: parsed.crashesInWindow,
      appVersion: parsed.appVersion,
      electronVersion: parsed.electronVersion,
      platform: parsed.platform,
      ...(userNotifiedAt !== undefined ? { userNotifiedAt } : {})
    }
  } catch {
    // missing or corrupt means no fallback requested
  }
  return null
}

export function writeGpuFallbackMarker(
  userDataPath: string,
  info: { engagedAt: number; crashesInWindow: number; userNotifiedAt?: number },
  environment: WindowsGpuFallbackEnvironment
): void {
  const userNotifiedAt = readOptionalFiniteNumber(info.userNotifiedAt)
  const marker: GpuFallbackMarker = {
    schemeVersion: GPU_FALLBACK_SCHEME_VERSION,
    engagedAt: info.engagedAt,
    crashesInWindow: info.crashesInWindow,
    appVersion: environment.appVersion,
    electronVersion: environment.electronVersion,
    platform: 'win32',
    ...(userNotifiedAt !== undefined ? { userNotifiedAt } : {})
  }
  writeFileSync(markerPath(userDataPath), JSON.stringify(marker))
}

/** Persist that the software-GPU notice was shown for the active sticky marker. */
export function markGpuFallbackUserNotified(
  userDataPath: string,
  notifiedAt: number = Date.now()
): boolean {
  const marker = readGpuFallbackMarker(userDataPath)
  if (!marker) {
    return false
  }
  if (readOptionalFiniteNumber(marker.userNotifiedAt) !== undefined) {
    return true
  }
  writeGpuFallbackMarker(
    userDataPath,
    {
      engagedAt: marker.engagedAt,
      crashesInWindow: marker.crashesInWindow,
      userNotifiedAt: notifiedAt
    },
    {
      appVersion: marker.appVersion,
      electronVersion: marker.electronVersion,
      platform: 'win32'
    }
  )
  return true
}

export function clearGpuFallbackMarker(userDataPath: string): void {
  try {
    rmSync(markerPath(userDataPath), { force: true })
  } catch {
    // best effort; a stale marker is revalidated on the next launch
  }
}

export function readActiveGpuFallbackMarker(
  userDataPath: string,
  environment: GpuFallbackEnvironment
): GpuFallbackMarker | null {
  const marker = readGpuFallbackMarker(userDataPath)
  if (!marker) {
    if (existsSync(markerPath(userDataPath))) {
      clearGpuFallbackMarker(userDataPath)
    }
    return null
  }
  if (
    environment.platform !== 'win32' ||
    marker.platform !== environment.platform ||
    marker.appVersion !== environment.appVersion ||
    marker.electronVersion !== environment.electronVersion
  ) {
    // Why: the marker is sticky only for the build that observed the driver
    // crash burst; updates get one fresh hardware attempt automatically.
    clearGpuFallbackMarker(userDataPath)
    return null
  }
  return marker
}
