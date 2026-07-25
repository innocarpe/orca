import { describe, expect, it } from 'vitest'
import en from '@/i18n/locales/en.json'
import es from '@/i18n/locales/es.json'
import ja from '@/i18n/locales/ja.json'
import ko from '@/i18n/locales/ko.json'
import zh from '@/i18n/locales/zh.json'

// Why assert the catalog rather than the component: en.json is bundled as the `en`
// resource, so a catalog value wins over translate()'s code fallback. #10588 shipped
// copy edits to the fallbacks only, which rendered nothing.
describe('OSC 52 setting copy', () => {
  const locales = { en, es, ja, ko, zh }

  for (const [name, locale] of Object.entries(locales)) {
    it(`names Zellij in the ${name} setting description and switch label`, () => {
      const pane = locale.auto.components.settings.TerminalPane
      expect(pane['69c64a479c']).toContain('Zellij')
      expect(pane['6e6480a7df']).toContain('Zellij')
    })
  }
})
