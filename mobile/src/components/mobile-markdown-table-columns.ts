import { spacing } from '../theme/mobile-theme'

/** Matches `tableCell` min/max in mobile-markdown-styles.ts. */
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

function longestLineLength(value: string): number {
  let longest = 0
  for (const line of value.split('\n')) {
    if (line.length > longest) {
      longest = line.length
    }
  }
  return longest
}
