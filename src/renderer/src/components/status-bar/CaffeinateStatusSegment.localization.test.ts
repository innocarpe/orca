import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { i18n, translate } from '@/i18n/i18n'
import en from '@/i18n/locales/en.json'
import es from '@/i18n/locales/es.json'
import ja from '@/i18n/locales/ja.json'
import ko from '@/i18n/locales/ko.json'
import zh from '@/i18n/locales/zh.json'
import { getAgentAwakeModeLabel, getAgentAwakeTitle } from '../settings/agent-awake-copy'

const chipSource = readFileSync(new URL('./CaffeinateStatusSegment.tsx', import.meta.url), 'utf8')
const catalogs = { es, ja, ko, zh }

const SHARED_KEYS = [
  'auto.components.settings.agent-awake-copy.modeTitle',
  'auto.components.settings.AgentAwakeSetting.on',
  'auto.components.settings.AgentAwakeSetting.auto',
  'auto.components.settings.AgentAwakeSetting.off'
] as const

const CHIP_EXTRA_KEYS = [
  'auto.components.status.bar.CaffeinateStatusSegment.active',
  'auto.components.status.bar.CaffeinateStatusSegment.inactive',
  'auto.components.status.bar.CaffeinateStatusSegment.onDescription',
  'auto.components.status.bar.CaffeinateStatusSegment.autoDescription',
  'auto.components.status.bar.CaffeinateStatusSegment.offDescription'
] as const

const ARIA_KEY = 'auto.components.status.bar.CaffeinateStatusSegment.ariaLabel'

function lookup(catalog: unknown, key: string): string | undefined {
  const value = key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      catalog
    )
  return typeof value === 'string' ? value : undefined
}

describe('keep-awake corner chip copy', () => {
  it('routes labels through shared agent-awake translate keys, not English literals', () => {
    expect(chipSource).toContain("from '../settings/agent-awake-copy'")
    expect(chipSource).toContain('getAgentAwakeTitle')
    expect(chipSource).toContain('getAgentAwakeModeLabel')
    expect(chipSource).toContain('CaffeinateStatusSegment.active')
    expect(chipSource).toContain('CaffeinateStatusSegment.inactive')
    expect(chipSource).toContain('CaffeinateStatusSegment.ariaLabel')
    expect(chipSource).toContain('CaffeinateStatusSegment.onDescription')
    expect(chipSource).not.toMatch(/['"]Caffeinate['"]/)
    expect(chipSource).not.toMatch(/['"]Caffeinate,/)
    expect(chipSource).not.toMatch(/>Caffeinate</)
    expect(chipSource).not.toMatch(/['"]On['"]/)
    expect(chipSource).not.toMatch(/['"]Agent['"]/)
    expect(chipSource).not.toMatch(/['"]Off['"]/)
  })

  it.each(Object.entries(catalogs))(
    '%s translates the shared title, mode labels, and chip extras',
    (locale, catalog) => {
      for (const key of [...SHARED_KEYS, ...CHIP_EXTRA_KEYS]) {
        const english = lookup(en, key)
        const localized = lookup(catalog, key)
        expect(english, `${key} missing from en.json`).toBeDefined()
        expect(localized, `${key} missing from ${locale}`).toBeDefined()
        expect(localized?.trim()).not.toBe('')
        // ja keeps the Agent mode name as a technical literal, matching Settings copy.
        if (locale === 'ja' && key.endsWith('.auto')) {
          continue
        }
        expect(localized, `${key} stayed English in ${locale}`).not.toBe(english)
      }

      expect(lookup(catalog, ARIA_KEY)).toBe('{{title}}, {{status}}')
    }
  )
})

describe('keep-awake corner chip under a Chinese UI language', () => {
  let previousLanguage: string

  beforeAll(async () => {
    previousLanguage = i18n.language
    await i18n.changeLanguage('zh')
  })

  afterAll(async () => {
    await i18n.changeLanguage(previousLanguage)
  })

  it('uses the shared Agents title and mode labels instead of English fallbacks', () => {
    expect(getAgentAwakeTitle()).toBe('保持电脑唤醒')
    expect(getAgentAwakeTitle()).not.toBe('Keep computer awake')
    expect(getAgentAwakeModeLabel('on')).toBe('开')
    expect(getAgentAwakeModeLabel('auto')).toBe('智能体')
    expect(getAgentAwakeModeLabel('off')).toBe('关')
  })

  it('localizes the chip extras used by the corner menu', () => {
    expect(translate('auto.components.status.bar.CaffeinateStatusSegment.active', 'Active')).toBe(
      '活动中'
    )
    expect(
      translate('auto.components.status.bar.CaffeinateStatusSegment.inactive', 'Inactive')
    ).toBe('未活动')
    expect(
      translate(
        'auto.components.status.bar.CaffeinateStatusSegment.ariaLabel',
        '{{title}}, {{status}}',
        { title: getAgentAwakeTitle(), status: `${getAgentAwakeModeLabel('off')} · 未活动` }
      )
    ).toBe('保持电脑唤醒, 关 · 未活动')
    expect(
      translate(
        'auto.components.status.bar.CaffeinateStatusSegment.onDescription',
        'Keep this computer awake continuously'
      )
    ).not.toBe('Keep this computer awake continuously')
  })
})
