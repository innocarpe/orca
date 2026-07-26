/**
 * Code-point boundary checks for terminal HTTP link scanning.
 * Why extracted: keeps hit-testing under max-lines while hosting CJK-aware rules (#10571).
 */

// Why (#10571 review): enumerate glyphs forever misses 〜/〖〗/NBSP; property classes scale.
const NON_ASCII_BODY_TERMINATOR_RE = /[\p{White_Space}\p{P}\p{Sm}]/u

export function isHttpUrlBodyTerminator(code: number): boolean {
  if (code <= 0x7f) {
    return isAsciiUrlWhitespace(code) || isAsciiUrlBodyDelimiter(code)
  }
  return isNonAsciiUrlBodyTerminator(code)
}

export function isHttpUrlTrailingPunctuation(code: number): boolean {
  if (code <= 0x7f) {
    return isAsciiUrlWhitespace(code) || isAsciiUrlTrailingPunctuation(code)
  }
  // Why: max-length cuts can leave non-ASCII punct at the candidate tail.
  return isNonAsciiUrlBodyTerminator(code)
}

/**
 * Why (#10571 review): if a terminator is missed, CJK must not fold into the
 * authority — WHATWG IDNA would silently retarget the link (spoof surface).
 * Paths/queries still accept non-ASCII after `/` `?` `#`.
 */
export function isHttpUrlAuthorityCodeAllowed(code: number): boolean {
  return code <= 0x7f
}

function isNonAsciiUrlBodyTerminator(code: number): boolean {
  return NON_ASCII_BODY_TERMINATOR_RE.test(String.fromCodePoint(code))
}

function isAsciiUrlWhitespace(code: number): boolean {
  return code === 9 || code === 10 || code === 11 || code === 12 || code === 13 || code === 32
}

function isAsciiUrlBodyDelimiter(code: number): boolean {
  return (
    code === 0x22 || // "
    code === 0x27 || // '
    code === 0x21 || // !
    code === 0x2a || // *
    code === 0x28 || // (
    code === 0x29 || // )
    code === 0x7b || // {
    code === 0x7d || // }
    code === 0x7c || // |
    code === 0x5c || // \
    code === 0x5e || // ^
    code === 0x3c || // <
    code === 0x3e || // >
    code === 0x60 // `
  )
}

function isAsciiUrlTrailingPunctuation(code: number): boolean {
  return (
    isAsciiUrlBodyDelimiter(code) ||
    code === 0x3a || // :
    code === 0x2c || // ,
    code === 0x2e || // .
    code === 0x3f || // ?
    code === 0x7e || // ~
    code === 0x5b || // [
    code === 0x5d // ]
  )
}
