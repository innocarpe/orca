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

function longestLineLength(value: string): number {
  let longest = 0
  for (const line of visibleInlineText(value).split('\n')) {
    if (line.length > longest) {
      longest = line.length
    }
  }
  return longest
}
