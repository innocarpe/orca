import { describe, expect, it } from 'vitest'
import {
  MOBILE_MARKDOWN_TABLE_CELL_MAX_WIDTH,
  MOBILE_MARKDOWN_TABLE_CELL_MIN_WIDTH,
  mobileMarkdownTableColumnWidths
} from './mobile-markdown-table-columns'

describe('mobileMarkdownTableColumnWidths', () => {
  it('gives every row in a column the width of that column’s longest cell', () => {
    const widths = mobileMarkdownTableColumnWidths(['A', 'State'], [['x'.repeat(80), 'Open']])

    expect(widths).toHaveLength(2)
    expect(widths[0]).toBe(MOBILE_MARKDOWN_TABLE_CELL_MAX_WIDTH)
    expect(widths[1]).toBe(MOBILE_MARKDOWN_TABLE_CELL_MIN_WIDTH)
    expect(widths[0]).toBeGreaterThan(widths[1]!)
  })

  it('uses the header when it is wider than the body', () => {
    const widths = mobileMarkdownTableColumnWidths(['Repository name', 'S'], [['Orca', 'ok']])

    expect(widths[0]).toBeGreaterThan(MOBILE_MARKDOWN_TABLE_CELL_MIN_WIDTH)
    expect(widths[0]).toBeLessThan(MOBILE_MARKDOWN_TABLE_CELL_MAX_WIDTH)
    expect(widths[1]).toBe(MOBILE_MARKDOWN_TABLE_CELL_MIN_WIDTH)
  })

  it('does not let an empty cell collapse its column', () => {
    expect(mobileMarkdownTableColumnWidths(['', 'Notes'], [['', '']])).toEqual([
      MOBILE_MARKDOWN_TABLE_CELL_MIN_WIDTH,
      MOBILE_MARKDOWN_TABLE_CELL_MIN_WIDTH
    ])
  })

  it('measures the longest line of a wrapped cell', () => {
    const short = mobileMarkdownTableColumnWidths(['H'], [['short']])
    const wrapped = mobileMarkdownTableColumnWidths(['H'], [['short\nmuch longer line']])

    expect(wrapped[0]).toBeGreaterThan(short[0]!)
  })
})
