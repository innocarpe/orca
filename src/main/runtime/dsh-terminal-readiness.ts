import { isTerminalWaitWhitespace, startOfLastLines } from './terminal-wait-tail-window'

// DSH-TUI rests on ✦, which is Gemini CLI's working glyph. The whale is what
// makes the title DeepSeek Harness. Evidence: a v0.11.0 capture on dsh 0.1.7-rc.1.
const DSH_REST_PREFIX = '\u2726'
const DSH_WHALE = '\u{1F40B}'
const DSH_COMPOSER = '\u276f'
// Chat.js TITLE_SPINNER_FRAMES while a turn is running.
const DSH_WORKING_FRAME_RE = /[\u2802\u2810]/
const DSH_WORKING_TAIL_LINES = 12

/** A finished DSH pane titles itself `✦ 🐋 …`. A running turn uses `⠂`/`⠐` instead. */
export function isDshRestingTitle(title: string): boolean {
  const trimmed = title.trim()
  return trimmed.startsWith(DSH_REST_PREFIX) && trimmed.includes(DSH_WHALE)
}

/**
 * Ready when the TUI banner is up and the composer is an idle `❯`, and the
 * bottom of the screen is not a live turn (`esc to interrupt` or a spinner frame).
 *
 * Why the model row: a shell that only echoed `dsh-tui` also ends in `❯`.
 * Why the bottom window: the intro keeps painting, so a quiet-tail wait never
 * settles, and an old `esc to interrupt` stays in scrollback after the turn.
 */
export function findDshReadyPromptIndex(normalized: string): number | null {
  const headerIndex = normalized.lastIndexOf('dsh-tui')
  if (headerIndex === -1) {
    return null
  }
  const segment = normalized.slice(headerIndex)
  if (!segment.includes('deepseek-flash') && !segment.includes('max effort')) {
    return null
  }
  const composerIndex = findLastLoneComposerIndex(segment)
  if (composerIndex === null) {
    return null
  }
  const windowStart = startOfLastLines(normalized, DSH_WORKING_TAIL_LINES)
  const tail = normalized.slice(windowStart)
  if (tail.includes('esc to interrupt') || DSH_WORKING_FRAME_RE.test(tail)) {
    return null
  }
  return headerIndex + composerIndex
}

function findLastLoneComposerIndex(segment: string): number | null {
  let offset = 0
  let found: number | null = null
  while (offset <= segment.length) {
    const newlineIndex = segment.indexOf('\n', offset)
    const lineEnd = newlineIndex === -1 ? segment.length : newlineIndex
    if (isLoneComposerLine(segment.slice(offset, lineEnd))) {
      found = offset
    }
    if (newlineIndex === -1) {
      break
    }
    offset = newlineIndex + 1
  }
  return found
}

function isLoneComposerLine(line: string): boolean {
  let start = 0
  let end = line.length
  while (start < end && isTerminalWaitWhitespace(line, start)) {
    start += 1
  }
  while (end > start && isTerminalWaitWhitespace(line, end - 1)) {
    end -= 1
  }
  while (start < end && isComposerDecoration(line.charCodeAt(start))) {
    start += 1
    while (start < end && isTerminalWaitWhitespace(line, start)) {
      start += 1
    }
  }
  return end - start === 1 && line.charCodeAt(start) === DSH_COMPOSER.charCodeAt(0)
}

function isComposerDecoration(code: number): boolean {
  return code === 0x2338 || (code >= 0x2500 && code <= 0x257f) || (code >= 0x2580 && code <= 0x259f)
}
