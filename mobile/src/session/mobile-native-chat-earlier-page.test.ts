import { describe, expect, it } from 'vitest'
import {
  createMobileEarlierPageGate,
  shouldRequestMobileEarlierPage,
  type MobileEarlierPageSample
} from './mobile-native-chat-earlier-page'

function sample(overrides: Partial<MobileEarlierPageSample> = {}): MobileEarlierPageSample {
  return {
    offsetY: 40,
    previousOffsetY: 120,
    itemCount: 40,
    requestedAtItemCount: -1,
    hasMore: true,
    loadingEarlier: false,
    ...overrides
  }
}

describe('shouldRequestMobileEarlierPage', () => {
  it('requests while the reader is scrolling up into the top edge', () => {
    expect(shouldRequestMobileEarlierPage(sample())).toBe(true)
  })

  it('allows the first near-top sample before a previous offset exists', () => {
    expect(shouldRequestMobileEarlierPage(sample({ previousOffsetY: null }))).toBe(true)
  })

  it('does not request again until the transcript grows', () => {
    expect(shouldRequestMobileEarlierPage(sample({ requestedAtItemCount: 40 }))).toBe(false)
  })

  it('does not request while the offset is holding or moving down', () => {
    expect(shouldRequestMobileEarlierPage(sample({ previousOffsetY: 40 }))).toBe(false)
    expect(shouldRequestMobileEarlierPage(sample({ previousOffsetY: 20 }))).toBe(false)
  })

  it('does not request away from the top, without more history, or while a page is loading', () => {
    expect(shouldRequestMobileEarlierPage(sample({ offsetY: 60 }))).toBe(false)
    expect(shouldRequestMobileEarlierPage(sample({ hasMore: false }))).toBe(false)
    expect(shouldRequestMobileEarlierPage(sample({ loadingEarlier: true }))).toBe(false)
  })
})

describe('createMobileEarlierPageGate', () => {
  it('fires once for a scroll into the top edge and again only after the list grows', () => {
    const gate = createMobileEarlierPageGate()
    const base = { hasMore: true, loadingEarlier: false }
    expect(gate.observe({ ...base, offsetY: 80, itemCount: 40 })).toBe(false)
    expect(gate.observe({ ...base, offsetY: 40, itemCount: 40 })).toBe(true)
    expect(gate.observe({ ...base, offsetY: 20, itemCount: 40 })).toBe(false)
    expect(gate.observe({ ...base, offsetY: 30, itemCount: 100 })).toBe(false)
    expect(gate.observe({ ...base, offsetY: 20, itemCount: 100 })).toBe(true)
  })
})
