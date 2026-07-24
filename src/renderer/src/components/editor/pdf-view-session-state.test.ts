import { beforeEach, describe, expect, it } from 'vitest'
import {
  _resetPdfViewSessionStateForTest,
  getPdfViewSession,
  setPdfViewSession
} from './pdf-view-session-state'

describe('pdf-view-session-state', () => {
  beforeEach(() => {
    _resetPdfViewSessionStateForTest()
  })

  it('stores and restores scale + scroll for a file path', () => {
    setPdfViewSession('/repo/doc.pdf', {
      scalePreference: 2,
      scrollTop: 400,
      scrollLeft: 12
    })
    expect(getPdfViewSession('/repo/doc.pdf')).toEqual({
      scalePreference: 2,
      scrollTop: 400,
      scrollLeft: 12
    })
  })

  it('merges partial updates so zoom and scroll do not clobber each other', () => {
    setPdfViewSession('/repo/doc.pdf', { scalePreference: 1.5, scrollTop: 10, scrollLeft: 0 })
    setPdfViewSession('/repo/doc.pdf', { scrollTop: 220 })
    expect(getPdfViewSession('/repo/doc.pdf')).toEqual({
      scalePreference: 1.5,
      scrollTop: 220,
      scrollLeft: 0
    })
  })

  it('keeps separate session state per file path', () => {
    setPdfViewSession('/a.pdf', { scalePreference: 2, scrollTop: 1, scrollLeft: 0 })
    setPdfViewSession('/b.pdf', { scalePreference: 'page-width', scrollTop: 99, scrollLeft: 3 })
    expect(getPdfViewSession('/a.pdf')?.scrollTop).toBe(1)
    expect(getPdfViewSession('/b.pdf')?.scalePreference).toBe('page-width')
  })
})
