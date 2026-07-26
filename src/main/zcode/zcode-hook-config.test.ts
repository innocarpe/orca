import { describe, expect, it } from 'vitest'
import {
  applyManagedZcodeHooks,
  isZcodeHooksEnabled,
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
})
