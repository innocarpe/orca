import { spacing } from '../theme/mobile-theme'
import { createMarkdownInlineMatcher, type MarkdownInlineMatch } from './markdown-inline-matcher'
import {
  isIntrawordUnderscoreToken,
  trimAutolinkTrailingPunctuation
} from './markdown-inline-token-rules'

/** Shared with `tableCell` min/max in mobile-markdown-styles.ts. */
export const MOBILE_MARKDOWN_TABLE_CELL_MIN_WIDTH = 112
export const MOBILE_MARKDOWN_TABLE_CELL_MAX_WIDTH = 220

const CELL_FONT_WIDTH = 7
const CELL_HORIZONTAL_PADDING = spacing.sm * 2

/**
 * One width per column, shared by the header and every body row.
 * Independent flex cells size to their own text, so a short header sits at a
 * different x than the long cell under it (#19803).
 */
export function mobileMarkdownTableColumnWidths(
  headers: readonly string[],
  rows: readonly (readonly string[])[]
): number[] {
  return headers.map((header, columnIndex) => {
    let longest = longestLineLength(header)
    for (const row of rows) {
      longest = Math.max(longest, longestLineLength(row[columnIndex] ?? ''))
    }
    const raw = Math.ceil(longest * CELL_FONT_WIDTH) + CELL_HORIZONTAL_PADDING
    return Math.min(
      MOBILE_MARKDOWN_TABLE_CELL_MAX_WIDTH,
      Math.max(MOBILE_MARKDOWN_TABLE_CELL_MIN_WIDTH, raw)
    )
  })
}

function visibleTokenText(token: string): string {
  const image = token.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
  if (image) {
    return image[1] || 'image'
  }
  const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
  if (link) {
    return link[1] ?? ''
  }
  if (/^https?:\/\//i.test(token)) {
    const { url, trailing } = trimAutolinkTrailingPunctuation(token)
    return `${url}${trailing}`
  }
  if (token.startsWith('`')) {
    return token.slice(1, -1)
  }
  if (token.startsWith('~~') || token.startsWith('**') || token.startsWith('__')) {
    return token.slice(2, -2)
  }
  return token.slice(1, -1)
}

function visibleInlineText(value: string): string {
  // Why: same tokens as renderInline, which paints a link label rather than its URL.
  const pattern = createMarkdownInlineMatcher(
    value,
    /(`[^`]+`|~~[^~]+~~|\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|https?:\/\/[^\s<]+)/g,
    true
  )
  const parts: string[] = []
  let pendingStart = 0
  let match: MarkdownInlineMatch | null
  while ((match = pattern.exec())) {
    const token = match[0]
    if (token.startsWith('_') && isIntrawordUnderscoreToken(value, match.index, token)) {
      pattern.lastIndex = match.index + 1
      continue
    }
    if (match.index > pendingStart) {
      parts.push(value.slice(pendingStart, match.index))
    }
    pendingStart = pattern.lastIndex
    parts.push(visibleTokenText(token))
  }
  if (pendingStart < value.length) {
    parts.push(value.slice(pendingStart))
  }
  return parts.join('')
}

type GraphemeSegmenter = {
  segment(value: string): Iterable<{ segment: string }>
}

function createGraphemeSegmenter(): GraphemeSegmenter | null {
  const intl = Intl as typeof Intl & {
    Segmenter?: new (locales: undefined, options: { granularity: 'grapheme' }) => GraphemeSegmenter
  }
  if (typeof intl.Segmenter !== 'function') {
    return null
  }
  return new intl.Segmenter(undefined, { granularity: 'grapheme' })
}

const graphemeSegmenter = createGraphemeSegmenter()

function isWideCodePoint(codePoint: number): boolean {
  return (
    codePoint > 0xffff ||
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6)
  )
}

function graphemeClusters(value: string): string[] {
  if (!graphemeSegmenter) {
    return Array.from(value)
  }
  return Array.from(graphemeSegmenter.segment(value), (part) => part.segment)
}

/** Column estimate at fontSize 12. Latin is 1, wide CJK and emoji are 2. */
function estimatedGlyphColumns(value: string): number {
  let columns = 0
  for (const cluster of graphemeClusters(value)) {
    if (cluster.includes('\u200d')) {
      columns += 2
      continue
    }
    const codePoint = cluster.codePointAt(0)
    if (codePoint === undefined || (codePoint >= 0x0300 && codePoint <= 0x036f)) {
      continue
    }
    if (codePoint === 0xfe0f || codePoint === 0x200d) {
      continue
    }
    columns += isWideCodePoint(codePoint) ? 2 : 1
  }
  return columns
}

function longestLineLength(value: string): number {
  let longest = 0
  for (const line of visibleInlineText(value).split('\n')) {
    const columns = estimatedGlyphColumns(line)
    if (columns > longest) {
      longest = columns
    }
  }
  return longest
}
