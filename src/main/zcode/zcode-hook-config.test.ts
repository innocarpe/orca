import { describe, expect, it } from 'vitest'
import {
  applyManagedZcodeHooks,
  isZcodeHooksEnabled,
  ORCA_PREVIOUS_HOOKS_ENABLED_KEY,
  readManagedZcodeHookEvents,
  removeManagedZcodeHooks,
  ZCODE_HOOK_EVENTS
} from './zcode-hook-config'

const COMMAND =
  "if [ -f '/home/u/.orca/agent-hooks/zcode-hook.sh' ]; then /bin/sh '/home/u/.orca/agent-hooks/zcode-hook.sh'; else :; fi"
const SCRIPT = 'zcode-hook.sh'

describe('zcode-hook-config', () => {
  it('enables hooks and installs managed entries for every tracked event', () => {
    const next = applyManagedZcodeHooks({}, COMMAND, SCRIPT)
    expect(isZcodeHooksEnabled(next)).toBe(true)
    const present = readManagedZcodeHookEvents(next, COMMAND)
    expect([...present].sort()).toEqual([...ZCODE_HOOK_EVENTS].sort())
  })

  it('preserves user hooks and strips only managed ones on remove', () => {
    const withUser = applyManagedZcodeHooks(
      {
        hooks: {
          enabled: true,
          events: {
            PreToolUse: [
              {
                matcher: 'Write',
                hooks: [{ type: 'command', command: 'echo keep-me', enabled: true }]
              }
            ]
          }
        }
      },
      COMMAND,
      SCRIPT
    )
    const removed = removeManagedZcodeHooks(withUser, SCRIPT)
    const pre = removed.hooks?.events?.PreToolUse ?? []
    expect(pre).toHaveLength(1)
    expect(pre[0]?.hooks?.[0]?.command).toBe('echo keep-me')
    expect(readManagedZcodeHookEvents(removed, COMMAND).size).toBe(0)
    expect(removed.hooks?.enabled).toBe(true)
    expect(removed.hooks?.[ORCA_PREVIOUS_HOOKS_ENABLED_KEY]).toBeUndefined()
  })

  it('restores pre-install hooks.enabled on remove', () => {
    const installed = applyManagedZcodeHooks(
      { hooks: { enabled: false, events: {} } },
      COMMAND,
      SCRIPT
    )
    expect(installed.hooks?.enabled).toBe(true)
    expect(installed.hooks?.[ORCA_PREVIOUS_HOOKS_ENABLED_KEY]).toBe(false)

    // Why: reinstall must not overwrite the stashed original enabled value.
    const reinstalled = applyManagedZcodeHooks(installed, COMMAND, SCRIPT)
    expect(reinstalled.hooks?.[ORCA_PREVIOUS_HOOKS_ENABLED_KEY]).toBe(false)

    const removed = removeManagedZcodeHooks(reinstalled, SCRIPT)
    expect(removed.hooks?.enabled).toBe(false)
    expect(removed.hooks?.[ORCA_PREVIOUS_HOOKS_ENABLED_KEY]).toBeUndefined()
  })

  it('is idempotent across reinstall', () => {
    const once = applyManagedZcodeHooks({}, COMMAND, SCRIPT)
    const twice = applyManagedZcodeHooks(once, COMMAND, SCRIPT)
    for (const event of ZCODE_HOOK_EVENTS) {
      const defs = twice.hooks?.events?.[event] ?? []
      const managed = defs.flatMap((d) => d.hooks ?? []).filter((h) => h.command === COMMAND)
      expect(managed).toHaveLength(1)
    }
  })

  it('tracks SessionStart among managed events', () => {
    expect(ZCODE_HOOK_EVENTS).toContain('SessionStart')
    const next = applyManagedZcodeHooks({}, COMMAND, SCRIPT)
    expect(readManagedZcodeHookEvents(next, COMMAND).has('SessionStart')).toBe(true)
  })
})
