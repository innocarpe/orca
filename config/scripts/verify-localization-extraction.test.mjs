import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { main as verifyLocalizationExtraction } from './verify-localization-extraction.mjs'

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function makeProject() {
  const root = mkdtempSync(path.join(tmpdir(), 'orca-localization-extraction-'))
  const extractionDir = path.join(root, 'config', 'localization-extraction')
  const catalogDir = path.join(root, 'src', 'renderer', 'src', 'i18n', 'locales')
  mkdirSync(extractionDir, { recursive: true })
  mkdirSync(catalogDir, { recursive: true })
  writeJson(path.join(extractionDir, 'en.json'), {
    auto: { active: 'Active', drift: 'Inline fallback', web: { example: 'Web' } },
    menu: { file: 'File' }
  })
  writeJson(path.join(catalogDir, 'en.json'), {
    auto: {
      active: 'Active',
      drift: 'Catalog fallback',
      orphan: 'Old copy',
      web: { example: 'Web' }
    },
    menu: { file: 'File' }
  })
  return root
}

describe('verify-localization-extraction dispositions', () => {
  it('writes pending dispositions without fabricating reviewed classifications', async () => {
    const root = makeProject()
    await expect(
      verifyLocalizationExtraction(root, ['--skip-extractor', '--update-dispositions'])
    ).resolves.toBe(1)
  })

  it('rejects legacy generated blanket reasons', async () => {
    const root = makeProject()
    writeJson(path.join(root, 'config', 'localization-extraction-dispositions.json'), {
      version: 1,
      orphans: {
        'auto.orphan': {
          disposition: 'retained-catalog-source-not-statically-referenced',
          reason:
            'Phase 2 keeps en.json authoritative until catalog ownership switches; this key has no current static source declaration.'
        }
      },
      fallbackDrift: {
        'auto.drift': {
          disposition: 'catalog-authoritative-through-phase-2',
          reason:
            'Phase 2 reports fallback drift while runtime fallback remains the committed en.json value.'
        }
      }
    })
    await expect(verifyLocalizationExtraction(root, ['--skip-extractor'])).resolves.toBe(1)
  })

  it('rejects unsupported dispositions and non-key-specific direct reasons', async () => {
    const root = makeProject()
    writeJson(path.join(root, 'config', 'localization-extraction-dispositions.json'), {
      version: 2,
      bulkReasons: {
        phase2CatalogRetention: {
          disposition: 'removed-source-retained-for-phase-2',
          reason:
            'Reviewed bulk rationale: Phase 2 keeps existing en.json catalog keys as runtime fallback source until catalog ownership switches, so removed-source keys are retained but tracked explicitly.'
        }
      },
      orphans: {
        'auto.orphan': {
          disposition: 'unclassified',
          reason: 'This orphan has a generic reason without the key.'
        }
      },
      fallbackDrift: {
        'auto.drift': {
          disposition: 'fallback-wording-drift-catalog-authoritative',
          reason: 'This drift has a generic reason without the key.'
        }
      }
    })
    await expect(verifyLocalizationExtraction(root, ['--skip-extractor'])).resolves.toBe(1)
  })

  it('preserves existing dispositions and leaves new differences pending', async () => {
    const root = makeProject()
    const existing = {
      disposition: 'migration-defect',
      reason: 'The auto.orphan extraction gap is a reviewed migration defect.'
    }
    writeJson(path.join(root, 'config', 'localization-extraction-dispositions.json'), {
      version: 2,
      bulkReasons: {},
      orphans: { 'auto.orphan': existing },
      fallbackDrift: {
        'auto.drift': {
          disposition: 'migration-defect',
          reason: 'The auto.drift fallback mismatch is a reviewed migration defect.'
        }
      }
    })
    const catalogPath = path.join(root, 'src', 'renderer', 'src', 'i18n', 'locales', 'en.json')
    const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
    catalog.auto.secondOrphan = 'Second orphan'
    writeJson(catalogPath, catalog)
    await expect(
      verifyLocalizationExtraction(root, ['--skip-extractor', '--update-dispositions'])
    ).resolves.toBe(1)
    const updated = JSON.parse(
      readFileSync(path.join(root, 'config', 'localization-extraction-dispositions.json'), 'utf8')
    )
    expect(updated.orphans['auto.orphan']).toEqual(existing)
    expect(updated.orphans['auto.secondOrphan'].disposition).toBe('pending-human-classification')
  })
})
