// OSC 52 — "Manipulate Selection Data". xterm.js does not implement this
// handler itself; applications register it to let TUIs (Zellij, tmux, Neovim,
// fzf, Grok) copy to the host clipboard over SSH or through the PTY.
//
// Wire format (xterm.js strips the leading `\x1b]52;` and trailing BEL/ST
// before handing us the payload string):
//
//     Pc ; Pd
//
// Pc is zero or more selection-kind letters ("c"=clipboard, "p"=primary,
// "q"=secondary, "s"=select). Orca maps every selection kind to the one
// system clipboard — it has no separate primary/cut-buffer sink here — so
// `selections` is reported for callers but not used to route the write.
// Pd is base64-encoded UTF-8. If Pd is "?" the TUI is *querying* the
// clipboard — we deliberately ignore that case to avoid leaking clipboard
// contents to any process writing to the PTY.
//
// Safety: OSC 52 is a classic data-exfil / overwrite vector — piping an
// attacker-controlled log into the terminal could silently replace the
// user's clipboard. Callers gate on `terminalAllowOsc52Clipboard` (default
// on; query stays blocked; payload size is capped).

export type Osc52ParseResult =
  /** `selections` is normalized: an empty Pc is reported as 'c'. */
  | { kind: 'write'; selections: string; text: string }
  | { kind: 'query' }
  | { kind: 'invalid'; reason: string }

export type Osc52ClipboardRequestOptions = {
  allowClipboardWrite: boolean
  writeClipboardText: (text: string) => Promise<void>
  onBlockedWrite?: () => void
}

const MAX_OSC52_BYTES = 128 * 1024

/** Resolves whether an incoming OSC 52 write may touch the clipboard, and whether a
 *  refusal is worth telling the user about. */
export function resolveOsc52ClipboardGate(input: {
  /** Null/undefined until settings hydrate. */
  settingEnabled: boolean | null | undefined
  /** True while recorded PTY bytes are being written back into this pane. */
  replaying: boolean
}): { allowClipboardWrite: boolean; shouldSurfaceBlockedWrite: boolean } {
  // Why drop during replay: reattach and cold-restore re-write recorded PTY bytes through the same
  // parser, so a stale `\e]52;c;…` would overwrite whatever the user has copied since. No fresh intent.
  const allowClipboardWrite = !input.replaying && input.settingEnabled === true
  return {
    allowClipboardWrite,
    // Why not toast on replay or pre-hydration: the toast latches once per renderer session, and neither
    // case is a real opt-out — unhydrated settings read as blocked even though the default is on.
    shouldSurfaceBlockedWrite:
      !allowClipboardWrite &&
      !input.replaying &&
      input.settingEnabled !== null &&
      input.settingEnabled !== undefined
  }
}

export function handleOsc52ClipboardRequest(
  data: string,
  options: Osc52ClipboardRequestOptions
): boolean {
  const parsed = parseOsc52(data)
  if (parsed.kind !== 'write') {
    return true
  }

  if (!options.allowClipboardWrite) {
    options.onBlockedWrite?.()
    return true
  }

  void options.writeClipboardText(parsed.text).catch(() => {
    /* ignore clipboard write failures */
  })
  return true
}

export function parseOsc52(data: string): Osc52ParseResult {
  const semi = data.indexOf(';')
  if (semi === -1) {
    return { kind: 'invalid', reason: 'missing selection/data separator' }
  }
  // Why accept empty Pc: tmux copies via `\e]52;;<base64>` (window-copy.c passes an
  // empty clip through the `Ms` capability). XTerm would read that as `s0`, but Orca
  // has one clipboard sink so every kind lands there anyway. Zellij always sends `c`/`p`.
  const selections = data.slice(0, semi) || 'c'
  const payload = data.slice(semi + 1)

  if (!/^[cpqs0-7]+$/.test(selections)) {
    return { kind: 'invalid', reason: 'unknown selection kind' }
  }

  if (payload === '?') {
    return { kind: 'query' }
  }

  // Why guard size: xterm's own parser caps OSC payloads at ~10 MB; we cap
  // tighter because a legitimate clipboard write is rarely more than a
  // screenful and any multi-MB payload is almost certainly a bug or abuse.
  if (payload.length > MAX_OSC52_BYTES) {
    return { kind: 'invalid', reason: 'payload exceeds size limit' }
  }

  const decoded = decodeBase64Utf8(payload)
  if (decoded === null) {
    return { kind: 'invalid', reason: 'payload is not valid base64' }
  }
  // Why reject empty: XTerm reads an empty Pd as "clear the selection", but the
  // only realistic source is a truncated sequence — and with the gate default-on
  // that would silently blank the clipboard. No TUI copies the empty string.
  if (decoded === '') {
    return { kind: 'invalid', reason: 'empty payload' }
  }
  return { kind: 'write', selections, text: decoded }
}

function decodeBase64Utf8(b64: string): string | null {
  // Why tolerate whitespace: some TUIs line-wrap the base64 payload. The
  // WHATWG `atob` rejects whitespace, so strip it first. Reject anything
  // else that doesn't match the base64 alphabet so we don't silently
  // accept garbage.
  const stripped = normalizeBase64Payload(b64)
  if (stripped === null) {
    return null
  }
  try {
    const binary = atob(stripped)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  } catch {
    return null
  }
}

function normalizeBase64Payload(value: string): string | null {
  let stripped = ''
  let sawWhitespace = false
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (isWhitespaceCode(code)) {
      if (!sawWhitespace) {
        stripped = value.slice(0, index)
        sawWhitespace = true
      }
      continue
    }
    if (!isBase64Code(code)) {
      return null
    }
    if (sawWhitespace) {
      stripped += value[index]
    }
  }
  return sawWhitespace ? stripped : value
}

function isBase64Code(code: number): boolean {
  return (
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    (code >= 48 && code <= 57) ||
    code === 43 ||
    code === 47 ||
    code === 61
  )
}

function isWhitespaceCode(code: number): boolean {
  return code === 32 || (code >= 9 && code <= 13)
}
