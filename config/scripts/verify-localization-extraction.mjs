import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

import { catalogFromEntries, flattenCatalog, jsonText } from './localization-catalog-model.mjs'
import { compareCodeUnits } from './localization-code-unit-order.mjs'

const TEMPLATE_PATH = path.join('config', 'localization-extraction', 'en.json')
const CATALOG_PATH = path.join('src', 'renderer', 'src', 'i18n', 'locales', 'en.json')
const DISPOSITIONS_PATH = path.join('config', 'localization-extraction-dispositions.json')
const require = createRequire(import.meta.url)
const LEGACY_ORPHAN_REASON =
  'Phase 2 keeps en.json authoritative until catalog ownership switches; this key has no current static source declaration.'
const LEGACY_DRIFT_REASON =
  'Phase 2 reports fallback drift while runtime fallback remains the committed en.json value.'
const BULK_REASONS = {
  phase2CatalogRetention: {
    disposition: 'removed-source-retained-for-phase-2',
    reason:
      'Reviewed bulk rationale: Phase 2 keeps existing en.json catalog keys as runtime fallback source until catalog ownership switches, so removed-source keys are retained but tracked explicitly.'
  }
}
const ORPHAN_DISPOSITIONS = new Set([
  'removed-source-retained-for-phase-2',
  'active-dynamic-extracted-elsewhere',
  'migration-defect'
])
const FALLBACK_DRIFT_DISPOSITIONS = new Set([
  'fallback-wording-drift-catalog-authoritative',
  'source-default-update-pending-catalog-adoption',
  'migration-defect'
])

function sorted(values) {
  return [...values].sort(compareCodeUnits)
}

function sameValues(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

async function updateDispositions(root, orphans, fallbackDrift) {
  let existing = { version: 2, bulkReasons: BULK_REASONS, orphans: {}, fallbackDrift: {} }
  try {
    existing = JSON.parse(await fs.readFile(path.join(root, DISPOSITIONS_PATH), 'utf8'))
  } catch {}
  const document = {
    version: 2,
    bulkReasons: existing.bulkReasons ?? BULK_REASONS,
    orphans: Object.fromEntries(
      sorted(new Set([...orphans, ...Object.keys(existing.orphans ?? {})])).map((key) => [
        key,
        existing.orphans?.[key] ?? {
          disposition: 'pending-human-classification',
          reason: `Pending explicit localization-owner disposition for orphan ${key}.`
        }
      ])
    ),
    fallbackDrift: Object.fromEntries(
      sorted(new Set([...fallbackDrift, ...Object.keys(existing.fallbackDrift ?? {})])).map(
        (key) => [
          key,
          existing.fallbackDrift?.[key] ?? {
            disposition: 'pending-human-classification',
            reason: `Pending explicit localization-owner disposition for fallback drift ${key}.`
          }
        ]
      )
    )
  }
  await fs.writeFile(path.join(root, DISPOSITIONS_PATH), jsonText(document))
}

function validateBulkReasons(dispositions) {
  const errors = []
  if (dispositions.version !== 2) {
    errors.push('extraction dispositions must use version 2')
  }
  if (
    !dispositions.bulkReasons ||
    typeof dispositions.bulkReasons !== 'object' ||
    Array.isArray(dispositions.bulkReasons)
  ) {
    errors.push('extraction dispositions bulkReasons must be an object')
    return errors
  }
  for (const [name, entry] of Object.entries(dispositions.bulkReasons)) {
    if (Object.keys(entry ?? {}).join('|') !== 'disposition|reason') {
      errors.push(`bulk reason ${name} has invalid fields`)
      continue
    }
    if (entry.disposition !== BULK_REASONS[name]?.disposition) {
      errors.push(`bulk reason ${name} has unsupported disposition ${entry.disposition}`)
    }
    if (entry.reason !== BULK_REASONS[name]?.reason) {
      errors.push(`bulk reason ${name} has unreviewed rationale text`)
    }
  }
  return errors
}

function validateDispositionRecords(records, allowedDispositions, label, bulkReasons) {
  const errors = []
  if (!records || typeof records !== 'object' || Array.isArray(records)) {
    return [`${label} dispositions must be an object keyed by localization key`]
  }
  for (const [key, entry] of Object.entries(records)) {
    const fields = Object.keys(entry ?? {}).join('|')
    if (fields !== 'disposition|reason' && fields !== 'disposition|reasonRef') {
      errors.push(`${label}:${key} has invalid fields`)
      continue
    }
    if (!allowedDispositions.has(entry.disposition)) {
      errors.push(`${label}:${key} has unsupported disposition ${entry.disposition}`)
    }
    if (entry.reasonRef) {
      const bulkReason = bulkReasons[entry.reasonRef]
      if (!bulkReason) {
        errors.push(`${label}:${key} references unknown bulk reason ${entry.reasonRef}`)
      } else if (bulkReason.disposition !== entry.disposition) {
        errors.push(`${label}:${key} bulk reason disposition mismatch`)
      }
      continue
    }
    if (
      typeof entry.reason !== 'string' ||
      entry.reason.trim().length < 24 ||
      !entry.reason.includes(key)
    ) {
      errors.push(`${label}:${key} is missing an explicit key-specific reason`)
    }
    if (entry.reason === LEGACY_ORPHAN_REASON || entry.reason === LEGACY_DRIFT_REASON) {
      errors.push(`${label}:${key} uses a rejected generated blanket reason`)
    }
  }
  return errors
}

export async function main(root = process.cwd(), argv = process.argv.slice(2)) {
  if (!argv.includes('--skip-extractor')) {
    const templatePath = path.join(root, TEMPLATE_PATH)
    const originalTemplate = await fs.readFile(templatePath, 'utf8')
    const packageDir = path.dirname(require.resolve('i18next-cli/package.json'))
    const cliPath = path.join(packageDir, 'dist', 'esm', 'cli.js')
    const result = spawnSync(process.execPath, [cliPath, 'extract', '--sync-primary', '--quiet'], {
      cwd: root,
      env: process.env,
      stdio: 'inherit'
    })
    if (result.status !== 0) {
      await fs.writeFile(templatePath, originalTemplate)
      console.error(
        'Source extraction is stale. Run `pnpm run sync:localization-extraction`; target catalogs are never edited.'
      )
      return result.status ?? 1
    }
    const extracted = JSON.parse(await fs.readFile(templatePath, 'utf8'))
    const normalized = jsonText(catalogFromEntries(flattenCatalog(extracted)))
    await fs.writeFile(templatePath, originalTemplate)
    if (normalized !== originalTemplate) {
      console.error(
        'Source extraction is stale. Run `pnpm run sync:localization-extraction`; target catalogs are never edited.'
      )
      return 1
    }
  } else if (argv.includes('--normalize-template')) {
    const templatePath = path.join(root, TEMPLATE_PATH)
    const extracted = JSON.parse(await fs.readFile(templatePath, 'utf8'))
    await fs.writeFile(templatePath, jsonText(catalogFromEntries(flattenCatalog(extracted))))
  }
  const template = flattenCatalog(JSON.parse(await fs.readFile(path.join(root, TEMPLATE_PATH))))
  const catalog = flattenCatalog(JSON.parse(await fs.readFile(path.join(root, CATALOG_PATH))))
  const missing = sorted([...template.keys()].filter((key) => !catalog.has(key)))
  const orphans = sorted([...catalog.keys()].filter((key) => !template.has(key)))
  const fallbackDrift = sorted(
    [...template]
      .filter(([key, value]) => catalog.has(key) && catalog.get(key) !== value)
      .map(([key]) => key)
  )

  if (missing.length > 0) {
    console.error(`Extracted keys missing from en.json:\n${missing.join('\n')}`)
    return 1
  }
  if (argv.includes('--update-dispositions')) {
    await updateDispositions(root, orphans, fallbackDrift)
  }
  const dispositions = JSON.parse(await fs.readFile(path.join(root, DISPOSITIONS_PATH)))
  const dispositionErrors = [
    ...validateBulkReasons(dispositions),
    ...validateDispositionRecords(
      dispositions.orphans,
      ORPHAN_DISPOSITIONS,
      'orphan',
      dispositions.bulkReasons ?? {}
    ),
    ...validateDispositionRecords(
      dispositions.fallbackDrift,
      FALLBACK_DRIFT_DISPOSITIONS,
      'fallback drift',
      dispositions.bulkReasons ?? {}
    )
  ]
  if (dispositionErrors.length > 0) {
    console.error('Extraction dispositions are invalid.')
    console.error(dispositionErrors.slice(0, 40).join('\n'))
    if (dispositionErrors.length > 40) {
      console.error(`...and ${dispositionErrors.length - 40} more error(s)`)
    }
    console.error(
      'Replace pending entries with explicit reviewed dispositions, then rerun `pnpm run verify:localization-extraction`.'
    )
    return 1
  }
  const expectedOrphans = sorted(Object.keys(dispositions.orphans))
  const expectedDrift = sorted(Object.keys(dispositions.fallbackDrift))
  if (!sameValues(orphans, expectedOrphans) || !sameValues(fallbackDrift, expectedDrift)) {
    console.error(
      'Extraction drift changed without an explicit orphan/fallback disposition update. Run `pnpm run sync:localization-extraction`, classify new pending entries, and manually remove records whose difference has resolved.'
    )
    return 1
  }
  const surfaceCounts = {
    renderer: [...template.keys()].filter((key) => key.startsWith('auto.')).length,
    web: [...template.keys()].filter((key) => key.startsWith('auto.web.')).length,
    main: [...template.keys()].filter((key) => key.startsWith('menu.')).length
  }
  if (Object.values(surfaceCounts).some((count) => count === 0)) {
    console.error(`Cross-process extraction proof failed: ${JSON.stringify(surfaceCounts)}`)
    return 1
  }
  console.log(
    `Verified deterministic source template: ${template.size} keys, ${orphans.length} disposed orphans, ` +
      `${fallbackDrift.length} disposed fallback drifts; ${JSON.stringify(surfaceCounts)}.`
  )
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main())
}
