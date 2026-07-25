/**
 * Code-point boundary checks for terminal HTTP link scanning.
 * Why extracted: keeps hit-testing under max-lines while hosting CJK-aware rules (#10571).
 */

export function isHttpUrlBodyTerminator(code: number): boolean {
  return (
    isUrlWhitespace(code) ||
    isAsciiUrlBodyDelimiter(code) ||
    // Why (#10571): CJK agents often glue fullwidth brackets/quotes to URLs
    // with no ASCII space; treat those as terminators like (){}<> ASCII peers.
    isCjkUrlBracketOrQuote(code)
  )
}

export function isHttpUrlTrailingPunctuation(code: number): boolean {
  return (
    isUrlWhitespace(code) ||
    isAsciiUrlTrailingPunctuation(code) ||
    // Why (#10571): strip trailing CJK punctuation the same way we strip .,?!
    isCjkUrlTrailingPunctuation(code)
  )
}

function isUrlWhitespace(code: number): boolean {
  // ASCII whitespace + U+3000 IDEOGRAPHIC SPACE (common after Japanese URLs).
  return (
    code === 9 ||
    code === 10 ||
    code === 11 ||
    code === 12 ||
    code === 13 ||
    code === 32 ||
    code === 0x3000
  )
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

/** Fullwidth and CJK bracket/quote code points that mirror ASCII URL delimiters. */
function isCjkUrlBracketOrQuote(code: number): boolean {
  return (
    code === 0xff08 || // （
    code === 0xff09 || // ）
    code === 0xff3b || // ［
    code === 0xff3d || // ］
    code === 0xff5b || // ｛
    code === 0xff5d || // ｝
    code === 0x3008 || // 〈
    code === 0x3009 || // 〉
    code === 0x300a || // 《
    code === 0x300b || // 》
    code === 0x300c || // 「
    code === 0x300d || // 」
    code === 0x300e || // 『
    code === 0x300f || // 』
    code === 0x3010 || // 【
    code === 0x3011 || // 】
    code === 0x3014 || // 〔
    code === 0x3015 // 〕
  )
}

function isCjkUrlTrailingPunctuation(code: number): boolean {
  return (
    isCjkUrlBracketOrQuote(code) ||
    code === 0x3001 || // 、
    code === 0x3002 || // 。
    code === 0x30fb || // ・
    code === 0x2026 || // …
    code === 0xff0c || // ，
    code === 0xff0e || // ．
    code === 0xff01 || // ！
    code === 0xff1f || // ？
    code === 0xff1a || // ：
    code === 0xff1b // ；
  )
}
