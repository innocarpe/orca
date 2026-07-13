import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import {
  ENGLISH_ONLY_KEY_PREFIXES,
  shouldPreserveEnglishValue
} from './locale-translation-policy.mjs'
import {
  deleteCatalogEntry,
  flattenCatalog,
  jsonText,
  setCatalogEntry,
  sourceHash,
  stateDocument
} from './localization-catalog-model.mjs'
import {
  LOCALIZATION_LOCALES as LOCALES,
  reviewedAuditValueMatches,
  reviewedByPolicy,
  validateReviewedAudit
} from './localization-reviewed-provenance.mjs'
import { collectReviewedCorrectionHistory } from './localization-git-history.mjs'
import { compareCodeUnits } from './localization-code-unit-order.mjs'

const LOCALES_DIR = path.join('src', 'renderer', 'src', 'i18n', 'locales')
const STATE_DIR = path.join('config', 'localization-state')
const AUDIT_PATH = path.join('config', 'localization-reviewed-corrections.json')
const COMMIT_CLASSIFICATIONS_PATH = path.join(
  'config',
  'localization-reviewed-commit-classifications.json'
)

async function writeReviewedAudit(root, onGitProcess) {
  const commitClassifications = JSON.parse(
    await fs.readFile(path.join(root, COMMIT_CLASSIFICATIONS_PATH), 'utf8')
  )
  const existingAudit = JSON.parse(await fs.readFile(path.join(root, AUDIT_PATH), 'utf8'))
  if (commitClassifications.version !== 1) {
    throw new Error('Localization provenance commit classifications must use version 1')
  }
  for (const [commit, entry] of Object.entries(commitClassifications.commits ?? {})) {
    if (
      !/^[a-f0-9]{40}$/.test(commit) ||
      !['reviewed-correction', 'mechanical-or-bulk'].includes(entry?.classification) ||
      typeof entry?.reason !== 'string' ||
      entry.reason.trim().length < 12
    ) {
      throw new Error(`Invalid localization provenance commit classification: ${commit}`)
    }
  }
  const localePaths = LOCALES.map((locale) =>
    path.join(LOCALES_DIR, `${locale}.json`).split(path.sep).join('/')
  )
  const enPath = path.join(LOCALES_DIR, 'en.json').split(path.sep).join('/')
  const { messages, provenance } = await collectReviewedCorrectionHistory(
    root,
    LOCALES,
    [enPath, ...localePaths],
    commitClassifications,
    onGitProcess
  )

  const document = {
    version: 3,
    algorithm: 'classified-first-parent-target-only-current-value-v2',
    provenance: [...provenance.values()].sort((left, right) =>
      compareCodeUnits(left.commit, right.commit)
    ),
    messages: Object.fromEntries(
      LOCALES.map((locale) => [
        locale,
        Object.fromEntries(
          [
            ...messages[locale],
            ...Object.entries(existingAudit.messages?.[locale] ?? {}).filter(
              ([, entry]) => entry.reason === 'localization-pr-review'
            )
          ].sort(([left], [right]) => compareCodeUnits(left, right))
        )
      ])
    )
  }
  await fs.writeFile(path.join(root, AUDIT_PATH), jsonText(document))
}

async function bootstrapLocale(root, locale, reviewedAudit) {
  const enEntries = flattenCatalog(
    JSON.parse(await fs.readFile(path.join(root, LOCALES_DIR, 'en.json')))
  )
  const localePath = path.join(root, LOCALES_DIR, `${locale}.json`)
  const targetCatalog = JSON.parse(await fs.readFile(localePath))
  const targetEntries = flattenCatalog(targetCatalog)
  const reviewedMessages = reviewedAudit.messages[locale]
  for (const [key, entry] of Object.entries(reviewedMessages)) {
    if (enEntries.has(key) && !targetEntries.has(key)) {
      setCatalogEntry(targetCatalog, key, entry.value)
      targetEntries.set(key, entry.value)
    }
  }
  const stateMessages = new Map()
  const counts = { reviewed: 0, machine: 0, intentionalEnglish: 0, parityFiller: 0 }

  for (const [key, value] of targetEntries) {
    const enValue = enEntries.get(key)
    if (enValue === undefined) {
      continue
    }
    const reviewedEntry = reviewedMessages[key]
    const reviewedValueMatches = reviewedAuditValueMatches(reviewedEntry, value)
    if (reviewedValueMatches || reviewedByPolicy(locale, key, enValue)) {
      stateMessages.set(key, { state: 'reviewed', sourceHash: sourceHash(enValue) })
      counts.reviewed += 1
    } else if (shouldPreserveEnglishValue(enValue, key)) {
      deleteCatalogEntry(targetCatalog, key)
      stateMessages.set(key, { state: 'intentional-english' })
      counts.intentionalEnglish += 1
    } else if (value === enValue) {
      deleteCatalogEntry(targetCatalog, key)
      counts.parityFiller += 1
    } else {
      stateMessages.set(key, { state: 'machine', sourceHash: sourceHash(enValue) })
      counts.machine += 1
    }
  }
  for (const [key, enValue] of enEntries) {
    if (!stateMessages.has(key) && shouldPreserveEnglishValue(enValue, key)) {
      stateMessages.set(key, { state: 'intentional-english' })
      counts.intentionalEnglish += 1
    }
  }
  await fs.writeFile(localePath, jsonText(targetCatalog))
  await fs.mkdir(path.join(root, STATE_DIR), { recursive: true })
  await fs.writeFile(
    path.join(root, STATE_DIR, `${locale}.json`),
    jsonText(stateDocument(locale, stateMessages))
  )
  console.log(`${locale}: ${JSON.stringify(counts)}`)
}

export async function main(root = process.cwd(), argv = process.argv.slice(2), dependencies = {}) {
  const environment = dependencies.environment ?? process.env
  if (
    environment.ORCA_I18N_MIGRATION_REWRITE !== '1' ||
    !argv.includes('--migration-rewrite-locales')
  ) {
    console.error(
      'Refusing localization-state bootstrap without ORCA_I18N_MIGRATION_REWRITE=1 and --migration-rewrite-locales.'
    )
    return 1
  }
  if (argv.includes('--audit-reviewed-commits')) {
    await writeReviewedAudit(root, dependencies.onGitProcess)
  }
  const audit = JSON.parse(await fs.readFile(path.join(root, AUDIT_PATH)))
  const errors = validateReviewedAudit(audit)
  if (errors.length > 0) {
    throw new Error(errors.join('\n'))
  }
  for (const locale of LOCALES) {
    await bootstrapLocale(root, locale, audit)
  }
  console.log(`Preservation policy prefixes audited: ${ENGLISH_ONLY_KEY_PREFIXES.join(', ')}`)
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main())
}
