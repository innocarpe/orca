import { describe, expect, it, vi } from 'vitest'
import {
  createOsc52OscHandler,
  handleOsc52ClipboardRequest,
  parseOsc52,
  resolveOsc52ClipboardGate
} from './osc52-clipboard'

function b64(s: string): string {
  return Buffer.from(s, 'utf-8').toString('base64')
}

describe('parseOsc52', () => {
  it('decodes the canonical clipboard write payload', () => {
    const result = parseOsc52(`c;${b64('hello world')}`)
    expect(result).toEqual({ kind: 'write', selections: 'c', text: 'hello world' })
  })

  it('preserves multi-byte UTF-8', () => {
    const result = parseOsc52(`c;${b64('café — 日本語')}`)
    expect(result).toEqual({ kind: 'write', selections: 'c', text: 'café — 日本語' })
  })

  it('accepts combined selection letters (e.g. primary + clipboard)', () => {
    const result = parseOsc52(`pc;${b64('dual')}`)
    expect(result).toEqual({ kind: 'write', selections: 'pc', text: 'dual' })
  })

  it('accepts numeric select-buffer indices', () => {
    const result = parseOsc52(`s0;${b64('buffered')}`)
    expect(result).toEqual({ kind: 'write', selections: 's0', text: 'buffered' })
  })

  it('flags clipboard queries without decoding — we must not answer them', () => {
    // Why: answering would leak the user's clipboard to any process writing
    // to the PTY. The lifecycle handler drops queries on the floor.
    expect(parseOsc52('c;?')).toEqual({ kind: 'query' })
  })

  it('tolerates whitespace in the base64 payload', () => {
    const replaceSpy = vi.spyOn(String.prototype, 'replace')
    const encoded = b64('multi-line data that got wrapped')
    const wrapped = `${encoded.slice(0, 10)}\n${encoded.slice(10)}`
    const result = parseOsc52(`c;${wrapped}`)
    const replaceCalls = replaceSpy.mock.calls.length

    expect(replaceCalls).toBe(0)
    expect(result).toEqual({
      kind: 'write',
      selections: 'c',
      text: 'multi-line data that got wrapped'
    })
  })

  it('rejects missing separator', () => {
    expect(parseOsc52(b64('no-semicolon'))).toMatchObject({ kind: 'invalid' })
  })

  it('treats an empty selection list as clipboard, the way tmux emits it', () => {
    // Why: tmux copies via `\e]52;;<base64>` with no selection letter, so
    // rejecting empty Pc broke tmux copy. Zellij always sends an explicit 'c'.
    expect(parseOsc52(`;${b64('from tmux')}`)).toEqual({
      kind: 'write',
      selections: 'c',
      text: 'from tmux'
    })
  })

  it('still refuses to answer a query when Pc is empty', () => {
    expect(parseOsc52(';?')).toEqual({ kind: 'query' })
  })

  it('rejects an empty payload instead of blanking the clipboard', () => {
    // Why: a truncated sequence is the only realistic source, and the gate is
    // now default-on — silently clearing the clipboard would be worse than a no-op.
    expect(parseOsc52(';')).toMatchObject({ kind: 'invalid' })
    expect(parseOsc52('c;')).toMatchObject({ kind: 'invalid' })
    expect(parseOsc52('c;   ')).toMatchObject({ kind: 'invalid' })
  })

  it('rejects unknown selection letters', () => {
    expect(parseOsc52(`x;${b64('x')}`)).toMatchObject({ kind: 'invalid' })
  })

  it('rejects non-base64 garbage', () => {
    expect(parseOsc52('c;!!!not-base64!!!')).toMatchObject({ kind: 'invalid' })
  })

  it('rejects payloads larger than the size cap', () => {
    const huge = 'A'.repeat(128 * 1024 + 100) // valid base64 alphabet char
    expect(parseOsc52(`c;${huge}`)).toMatchObject({ kind: 'invalid' })
  })
})

describe('handleOsc52ClipboardRequest', () => {
  it('writes valid OSC 52 clipboard payloads when enabled', () => {
    const writeClipboardText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)

    expect(
      handleOsc52ClipboardRequest(`c;${b64('from remote')}`, {
        allowClipboardWrite: true,
        writeClipboardText
      })
    ).toBe(true)

    expect(writeClipboardText).toHaveBeenCalledWith('from remote')
  })

  it('surfaces a blocked valid write when OSC 52 clipboard writes are disabled', () => {
    const writeClipboardText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    const onBlockedWrite = vi.fn()

    expect(
      handleOsc52ClipboardRequest(`c;${b64('from remote')}`, {
        allowClipboardWrite: false,
        writeClipboardText,
        onBlockedWrite
      })
    ).toBe(true)

    expect(writeClipboardText).not.toHaveBeenCalled()
    expect(onBlockedWrite).toHaveBeenCalledTimes(1)
  })

  it('never answers a clipboard query even with writes enabled', () => {
    // Why: enabled is now the default, so the query block has to hold in the
    // configuration nearly every user runs — not just the opted-out one.
    const writeClipboardText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)

    for (const query of ['c;?', ';?']) {
      expect(
        handleOsc52ClipboardRequest(query, { allowClipboardWrite: true, writeClipboardText })
      ).toBe(true)
    }

    expect(writeClipboardText).not.toHaveBeenCalled()
  })

  it('does not surface blocked queries because Orca must not answer them', () => {
    const onBlockedWrite = vi.fn()

    handleOsc52ClipboardRequest('c;?', {
      allowClipboardWrite: false,
      writeClipboardText: vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined),
      onBlockedWrite
    })

    expect(onBlockedWrite).not.toHaveBeenCalled()
  })
})

describe('createOsc52OscHandler', () => {
  function setup(overrides: { settingEnabled?: boolean | null; replaying?: boolean } = {}) {
    const settingEnabled = 'settingEnabled' in overrides ? overrides.settingEnabled : true
    const writeClipboardText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    const showBlockedWriteToast = vi.fn()
    const handler = createOsc52OscHandler({
      getSettingEnabled: () => settingEnabled,
      getReplaying: () => overrides.replaying ?? false,
      writeClipboardText,
      showBlockedWriteToast
    })
    return { handler, writeClipboardText, showBlockedWriteToast }
  }

  it('writes through to the clipboard for a live pane', () => {
    const { handler, writeClipboardText } = setup()
    expect(handler(`c;${b64('live copy')}`)).toBe(true)
    expect(writeClipboardText).toHaveBeenCalledWith('live copy')
  })

  it('reads the gate inputs at fire time so a mid-session toggle applies', () => {
    // Why getters, not values: settings hydrate and toggle after the handler is registered.
    let enabled = false
    const writeClipboardText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    const handler = createOsc52OscHandler({
      getSettingEnabled: () => enabled,
      getReplaying: () => false,
      writeClipboardText,
      showBlockedWriteToast: vi.fn()
    })

    handler(`c;${b64('before')}`)
    expect(writeClipboardText).not.toHaveBeenCalled()

    enabled = true
    handler(`c;${b64('after')}`)
    expect(writeClipboardText).toHaveBeenCalledExactlyOnceWith('after')
  })

  it('drops a replayed write and stays silent about it', () => {
    // Revert-proof for the wiring: dropping the replay getter makes this fail.
    const { handler, writeClipboardText, showBlockedWriteToast } = setup({ replaying: true })
    expect(handler(`c;${b64('stale scrollback copy')}`)).toBe(true)
    expect(writeClipboardText).not.toHaveBeenCalled()
    expect(showBlockedWriteToast).not.toHaveBeenCalled()
  })

  it('toasts only for a real opt-out, never for unhydrated settings', () => {
    const optedOut = setup({ settingEnabled: false })
    optedOut.handler(`c;${b64('blocked')}`)
    expect(optedOut.showBlockedWriteToast).toHaveBeenCalledTimes(1)

    const unhydrated = setup({ settingEnabled: null })
    unhydrated.handler(`c;${b64('blocked')}`)
    expect(unhydrated.writeClipboardText).not.toHaveBeenCalled()
    expect(unhydrated.showBlockedWriteToast).not.toHaveBeenCalled()
  })
})

describe('resolveOsc52ClipboardGate', () => {
  it('allows a live write once the setting is on', () => {
    expect(resolveOsc52ClipboardGate({ settingEnabled: true, replaying: false })).toEqual({
      allowClipboardWrite: true,
      shouldSurfaceBlockedWrite: false
    })
  })

  it('drops replayed writes so restore cannot clobber the clipboard', () => {
    // Why: reattach re-writes recorded PTY bytes through the same parser, so an old
    // copy would silently overwrite what the user has copied since (#10588 review).
    expect(resolveOsc52ClipboardGate({ settingEnabled: true, replaying: true })).toEqual({
      allowClipboardWrite: false,
      shouldSurfaceBlockedWrite: false
    })
  })

  it('surfaces the blocked toast only for a real opt-out', () => {
    expect(resolveOsc52ClipboardGate({ settingEnabled: false, replaying: false })).toEqual({
      allowClipboardWrite: false,
      shouldSurfaceBlockedWrite: true
    })
  })

  it('stays quiet when a write races settings hydration', () => {
    // Why: the toast latches once per renderer session; an unhydrated read looks
    // blocked even though the default is on, so burning it there hides the real one.
    for (const settingEnabled of [null, undefined]) {
      expect(resolveOsc52ClipboardGate({ settingEnabled, replaying: false })).toEqual({
        allowClipboardWrite: false,
        shouldSurfaceBlockedWrite: false
      })
    }
  })
})
