import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import { flattenCatalog, sourceHash } from './localization-catalog-model.mjs'
import { LOCALIZATION_LOCALES } from './localization-reviewed-provenance.mjs'

const LOCALES_DIR = path.join('src', 'renderer', 'src', 'i18n', 'locales')
const STATE_DIR = path.join('config', 'localization-state')

export async function main(root = process.cwd()) {
  const enEntries = flattenCatalog(
    JSON.parse(await fs.readFile(path.join(root, LOCALES_DIR, 'en.json')))
  )
  console.log('locale\tuntranslated\tintentional-english\tstale\tmachine\treviewed')
  for (const locale of LOCALIZATION_LOCALES) {
    const targetEntries = flattenCatalog(
      JSON.parse(await fs.readFile(path.join(root, LOCALES_DIR, `${locale}.json`)))
    )
    const state = JSON.parse(await fs.readFile(path.join(root, STATE_DIR, `${locale}.json`)))
    const counts = { untranslated: 0, intentionalEnglish: 0, stale: 0, machine: 0, reviewed: 0 }
    for (const [key, entry] of Object.entries(state.messages)) {
      if (entry.state === 'intentional-english') {
        counts.intentionalEnglish += 1
      }
      if (entry.state === 'machine') {
        counts.machine += 1
      }
      if (entry.state === 'reviewed') {
        counts.reviewed += 1
      }
      if (
        entry.sourceHash &&
        enEntries.has(key) &&
        entry.sourceHash !== sourceHash(enEntries.get(key))
      ) {
        counts.stale += 1
      }
    }
    for (const key of enEntries.keys()) {
      if (!targetEntries.has(key) && !state.messages[key]) {
        counts.untranslated += 1
      }
    }
    console.log(
      `${locale}\t${counts.untranslated}\t${counts.intentionalEnglish}\t${counts.stale}\t${counts.machine}\t${counts.reviewed}`
    )
  }
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main())
}
