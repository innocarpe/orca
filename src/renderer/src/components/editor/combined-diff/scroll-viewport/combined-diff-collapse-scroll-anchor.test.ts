import { describe, expect, it } from 'vitest'
import type { VirtualizedScrollAnchor } from '@/hooks/useVirtualizedScrollAnchor'
import { pinScrollAnchorWhenCollapsingSection } from './combined-diff-collapse-scroll-anchor'

function anchor(offset: number): NonNullable<VirtualizedScrollAnchor> {
  return { key: 'src/app.ts', offset, scrollTop: 2_000 }
}

describe('pinScrollAnchorWhenCollapsingSection', () => {
  it('pins the header when the anchored section is the one being collapsed', () => {
    const current = anchor(1_800)
    pinScrollAnchorWhenCollapsingSection(current, { collapsed: false, key: 'src/app.ts' })
    expect(current.offset).toBe(0)
    expect(current.scrollTop).toBe(2_000)
    expect(current.key).toBe('src/app.ts')
  })

  it('leaves the anchor when that section is expanding', () => {
    const current = anchor(0)
    pinScrollAnchorWhenCollapsingSection(current, { collapsed: true, key: 'src/app.ts' })
    expect(current.offset).toBe(0)
  })

  it('leaves the anchor when a different section collapses', () => {
    const current = anchor(400)
    pinScrollAnchorWhenCollapsingSection(current, { collapsed: false, key: 'src/other.ts' })
    expect(current.offset).toBe(400)
  })

  it('does nothing without an anchor or a section', () => {
    expect(() => pinScrollAnchorWhenCollapsingSection(null, undefined)).not.toThrow()
    const current = anchor(40)
    pinScrollAnchorWhenCollapsingSection(current, undefined)
    expect(current.offset).toBe(40)
  })
})
