import { describe, expect, it, vi } from 'vitest'
import {
  computeTerminalTailWaitState,
  clearMirroredLeafWaitStamps,
  resolveWaitBlockedAt,
  tailSettledReadyClearsBlockedWait
} from './terminal-wait-tail-state'

describe('terminal tail wait state', () => {
  it('computeTerminalTailWaitState reports fromTail and blocked signals', () => {
    const empty = computeTerminalTailWaitState([], '', '')
    expect(empty.fromTail).toBe(false)
    expect(empty.signal).toBeNull()

    const previewOnly = computeTerminalTailWaitState([], '', 'short preview')
    expect(previewOnly.fromTail).toBe(false)
    expect(previewOnly.waitText).toBe('short preview')

    const blocked = computeTerminalTailWaitState(
      ['Update available! Press Enter to continue.'],
      '',
      ''
    )
    expect(blocked.fromTail).toBe(true)
    expect(blocked.signal?.reason).toBe('agent-update-prompt')
  })

  it('does not rebuild or repeatedly scan an ordinary saturated tail', () => {
    const lines = Array.from({ length: 2000 }, () => 'x'.repeat(126))
    const lastIndexOf = vi.spyOn(String.prototype, 'lastIndexOf')

    try {
      const state = computeTerminalTailWaitState(lines, '', '')

      expect(state.signal).toBeNull()
      expect(state.waitText).toBe('')
      expect(lastIndexOf).not.toHaveBeenCalled()
    } finally {
      lastIndexOf.mockRestore()
    }
  })

  it('clears a blocked stamp only for a settled ready tail', () => {
    const ready = {
      waitText:
        '╭───╮\n│ >_ openai codex (v0.157.0) │\n│ model: gpt-5 │\n│ directory: ~/repo │\n╰───╯',
      signal: null,
      fromTail: true
    }
    const blocked = {
      waitText: 'Hooks need review\nPress enter to confirm',
      signal: { reason: 'agent-hooks-review-prompt' as const, index: 0 },
      fromTail: true
    }
    const preview = { ...ready, fromTail: false }
    const inconclusive = { ...ready, waitText: 'ordinary output' }

    expect(tailSettledReadyClearsBlockedWait(ready)).toBe(true)
    expect(resolveWaitBlockedAt(12, false, ready, 99)).toBeNull()
    expect(resolveWaitBlockedAt(12, true, ready, 99)).toBe(99)
    expect(resolveWaitBlockedAt(12, false, blocked, 99)).toBe(12)
    expect(resolveWaitBlockedAt(12, false, preview, 99)).toBe(12)
    expect(resolveWaitBlockedAt(12, false, inconclusive, 99)).toBe(12)
    expect(resolveWaitBlockedAt(null, false, ready, 99)).toBeNull()
  })

  it('clears deferred stamps only on leaves that share the PTY tail', () => {
    const tail = ['ready tail']
    const matching = { tailBuffer: tail, waitBlockedAt: 4 }
    const other = { tailBuffer: ['other tail'], waitBlockedAt: 4 }

    clearMirroredLeafWaitStamps(4, null, tail, [matching, other])

    expect(matching.waitBlockedAt).toBeNull()
    expect(other.waitBlockedAt).toBe(4)
    clearMirroredLeafWaitStamps(null, null, tail, [other])
    expect(other.waitBlockedAt).toBe(4)
  })
})
