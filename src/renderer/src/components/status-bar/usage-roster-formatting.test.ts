import { describe, expect, it } from 'vitest'
import {
  formatPlanLabel,
  formatUsageUpdatedLabel,
  usageTextColorClass
} from './usage-roster-formatting'

describe('formatPlanLabel', () => {
  it('capitalizes a single-word plan', () => {
    expect(formatPlanLabel('plus')).toBe('Plus')
    expect(formatPlanLabel('pro')).toBe('Pro')
    expect(formatPlanLabel('business')).toBe('Business')
  })

  it('title-cases multi-token plans across separators', () => {
    expect(formatPlanLabel('chatgpt_business')).toBe('ChatGPT Business')
    expect(formatPlanLabel('CHATGPT_PLUS')).toBe('ChatGPT Plus')
    expect(formatPlanLabel('team-plus')).toBe('Team Plus')
    expect(formatPlanLabel('pro trial')).toBe('Pro Trial')
  })

  it('returns null when there is no usable plan', () => {
    expect(formatPlanLabel(null)).toBeNull()
    expect(formatPlanLabel(undefined)).toBeNull()
    expect(formatPlanLabel('')).toBeNull()
    expect(formatPlanLabel('   ')).toBeNull()
  })
})

describe('formatUsageUpdatedLabel', () => {
  const now = 1_000_000_000

  it('returns null when there is no usable timestamp', () => {
    expect(formatUsageUpdatedLabel(0, now)).toBeNull()
    expect(formatUsageUpdatedLabel(Number.NaN, now)).toBeNull()
  })

  it('uses the same just-now / minutes / hours thresholds as the tooltip', () => {
    expect(formatUsageUpdatedLabel(now - 30_000, now)).toBe('Updated just now')
    expect(formatUsageUpdatedLabel(now - 5 * 60_000, now)).toBe('Updated 5m ago')
    expect(formatUsageUpdatedLabel(now - 3 * 3_600_000, now)).toBe('Updated 3h ago')
  })
})

describe('usageTextColorClass', () => {
  it('stays neutral below the 60% caution line', () => {
    expect(usageTextColorClass(0)).toBe('text-foreground')
    expect(usageTextColorClass(59)).toBe('text-foreground')
  })

  it('turns amber in the 60–79% caution band', () => {
    expect(usageTextColorClass(60)).toBe('text-yellow-500')
    expect(usageTextColorClass(79)).toBe('text-yellow-500')
  })

  it('turns red at the 80% critical line and above', () => {
    expect(usageTextColorClass(80)).toBe('text-red-500')
    expect(usageTextColorClass(100)).toBe('text-red-500')
  })
})
