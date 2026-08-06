import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type * as childProcessModule from 'node:child_process'

describe('isAdvertisableChromiumEngineVersion', () => {
  it('accepts real Chromium engine majors and rejects product versions', async () => {
    const { isAdvertisableChromiumEngineVersion } = await import('./browser-cookie-import')
    expect(isAdvertisableChromiumEngineVersion('120.0.6099.71')).toBe(true)
    expect(isAdvertisableChromiumEngineVersion('70.0.0.0')).toBe(true)
    expect(isAdvertisableChromiumEngineVersion('1.158.1')).toBe(false)
    expect(isAdvertisableChromiumEngineVersion('1.0.0')).toBe(false)
    expect(isAdvertisableChromiumEngineVersion('not-a-version')).toBe(false)
  })
})

describe('getUserAgentForBrowser — Arc product version', () => {
  const originalPlatform = process.platform

  beforeEach(() => {
    vi.resetModules()
    Object.defineProperty(process, 'platform', { value: 'darwin' })
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
    vi.restoreAllMocks()
  })

  it('does not persist Chrome/1.x when Arc reports its product version', async () => {
    vi.doMock('node:child_process', async () => {
      const actual = await vi.importActual<typeof childProcessModule>('node:child_process')
      return {
        ...actual,
        execFileSync: (cmd: string, args: readonly string[]) => {
          if (cmd === 'defaults' && args[1]?.includes('/Applications/Arc.app/Contents/Info')) {
            return '1.158.1\n'
          }
          return actual.execFileSync(cmd, args as never)
        }
      }
    })

    const { getUserAgentForBrowser } = await import('./browser-cookie-import')
    expect(getUserAgentForBrowser('arc')).toBeNull()
  })

  it('still builds a Chrome-shaped UA when Arc reports an engine-scale version', async () => {
    vi.doMock('node:child_process', async () => {
      const actual = await vi.importActual<typeof childProcessModule>('node:child_process')
      return {
        ...actual,
        execFileSync: (cmd: string, args: readonly string[]) => {
          if (cmd === 'defaults' && args[1]?.includes('/Applications/Arc.app/Contents/Info')) {
            return '120.0.6099.71\n'
          }
          return actual.execFileSync(cmd, args as never)
        }
      }
    })

    const { getUserAgentForBrowser } = await import('./browser-cookie-import')
    const ua = getUserAgentForBrowser('arc')
    expect(ua).toContain('Chrome/120.0.6099.71')
    expect(ua).not.toContain('Chrome/1.')
  })
})
