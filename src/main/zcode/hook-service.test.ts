import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ZcodeHookService } from './hook-service'
import { ZCODE_HOOK_EVENTS } from './zcode-hook-config'

// Why: getSharedManagedScriptPath() writes under homedir()/.orca and ZCode
// config is ~/.zcode/cli/config.json. Point $HOME at a temp dir so install/remove
// never touch the real user profile.
let home: string
let originalHome: string | undefined

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'orca-zcode-hook-'))
  originalHome = process.env.HOME
  process.env.HOME = home
})

afterEach(() => {
  if (originalHome === undefined) {
    delete process.env.HOME
  } else {
    process.env.HOME = originalHome
  }
  rmSync(home, { recursive: true, force: true })
})

const configPath = (): string => join(home, '.zcode', 'cli', 'config.json')
const scriptPath = (): string => join(home, '.orca', 'agent-hooks', 'zcode-hook.sh')

describe('ZcodeHookService', () => {
  it('reports not_installed before install', () => {
    expect(new ZcodeHookService().getStatus().state).toBe('not_installed')
  })

  it('installs managed hooks into ~/.zcode/cli/config.json and the managed script', () => {
    const status = new ZcodeHookService().install()
    expect(status.state).toBe('installed')
    expect(status.managedHooksPresent).toBe(true)

    const config = JSON.parse(readFileSync(configPath(), 'utf-8')) as {
      hooks?: { enabled?: boolean; events?: Record<string, unknown[]> }
    }
    expect(config.hooks?.enabled).toBe(true)
    for (const event of ZCODE_HOOK_EVENTS) {
      expect(config.hooks?.events?.[event]).toBeDefined()
      expect(Array.isArray(config.hooks?.events?.[event])).toBe(true)
    }

    const script = readFileSync(scriptPath(), 'utf-8')
    expect(script).toContain('/hook/zcode')
    expect(script).toContain('printf \'%s\' "$payload" | curl')
    expect(script).toContain('--data-urlencode "payload@-"')
    expect(script).not.toContain('--data-urlencode "payload=${payload}"')

    const serialized = readFileSync(configPath(), 'utf-8')
    expect(serialized).toContain('agent-hooks/zcode-hook.sh')
  })

  it('keeps user config when installing, then restores it on remove', () => {
    const dir = join(home, '.zcode', 'cli')
    mkdirSync(dir, { recursive: true })
    const userConfig = {
      theme: 'dark',
      hooks: {
        enabled: false,
        events: {
          PreToolUse: [
            {
              matcher: 'Write',
              hooks: [{ type: 'command', command: 'echo user-hook', enabled: true }]
            }
          ]
        }
      }
    }
    writeFileSync(configPath(), `${JSON.stringify(userConfig, null, 2)}\n`)

    const service = new ZcodeHookService()
    expect(service.install().state).toBe('installed')

    type HookDef = { hooks?: { command?: string }[] }
    type Parsed = {
      theme?: string
      hooks?: { enabled?: boolean; events?: Record<string, HookDef[]> }
    }
    const installed = JSON.parse(readFileSync(configPath(), 'utf-8')) as Parsed
    expect(installed.theme).toBe('dark')
    expect(installed.hooks?.enabled).toBe(true)
    const preTool = installed.hooks?.events?.PreToolUse ?? []
    expect(preTool.some((def) => def.hooks?.some((h) => h.command === 'echo user-hook'))).toBe(true)
    expect(preTool.some((def) => def.hooks?.some((h) => h.command?.includes('zcode-hook')))).toBe(
      true
    )

    // Reinstall must not duplicate managed entries.
    service.install()
    const reinstalled = JSON.parse(readFileSync(configPath(), 'utf-8')) as Parsed
    const managedCount = (reinstalled.hooks?.events?.PreToolUse ?? [])
      .flatMap((def) => def.hooks ?? [])
      .filter((hook) => hook.command?.includes('zcode-hook')).length
    expect(managedCount).toBe(1)

    const removed = service.remove()
    expect(removed.state).toBe('not_installed')
    const afterRemove = JSON.parse(readFileSync(configPath(), 'utf-8')) as Parsed
    expect(afterRemove.theme).toBe('dark')
    // Why: install forced enabled=true; remove does not flip enabled back.
    expect(afterRemove.hooks?.enabled).toBe(true)
    const remainingPre = afterRemove.hooks?.events?.PreToolUse ?? []
    expect(remainingPre.some((def) => def.hooks?.some((h) => h.command === 'echo user-hook'))).toBe(
      true
    )
    expect(
      remainingPre.some((def) => def.hooks?.some((h) => h.command?.includes('zcode-hook')))
    ).toBe(false)
  })
})
