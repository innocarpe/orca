import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { main as bootstrapLocalizationState } from './bootstrap-localization-state.mjs'
import { sourceHash } from './localization-catalog-model.mjs'
import { shouldPreserveEnglishValue } from './locale-translation-policy.mjs'

const LOCALES = ['es', 'ja', 'ko', 'zh']
const MIGRATION_ARGS = ['--migration-rewrite-locales']
const MIGRATION_ENVIRONMENT = { ORCA_I18N_MIGRATION_REWRITE: '1' }

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function runGit(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' })
}

function commitAll(root, subject) {
  runGit(root, ['add', '.'])
  runGit(root, [
    '-c',
    'user.name=Orca Test',
    '-c',
    'user.email=orca@example.com',
    'commit',
    '-m',
    subject
  ])
}

describe('bootstrap-localization-state', () => {
  it('keeps the mobile Continue action translatable despite the product-name policy', () => {
    expect(
      shouldPreserveEnglishValue('Continue', 'auto.components.mobile.MobileHero.a8fb43cf1c')
    ).toBe(false)
  })

  it('classifies provenance deterministically and removes only fallback leaves', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'orca-localization-bootstrap-'))
    const localesDir = path.join(root, 'src', 'renderer', 'src', 'i18n', 'locales')
    mkdirSync(localesDir, { recursive: true })
    mkdirSync(path.join(root, 'config'), { recursive: true })
    const enCatalog = {
      auto: {
        example: {
          filler: 'Hello',
          machine: 'Welcome',
          reviewed: 'Explore Orca'
        },
        lib: { agent: { catalog: { codex: 'Codex' } } }
      }
    }
    writeJson(path.join(localesDir, 'en.json'), enCatalog)
    for (const locale of LOCALES) {
      writeJson(path.join(localesDir, `${locale}.json`), {
        auto: {
          example: {
            filler: 'Hello',
            machine: `translated-${locale}`,
            reviewed: locale === 'es' ? 'Explorar Orca' : `translated-review-${locale}`
          },
          lib: { agent: { catalog: { codex: 'Codex' } } }
        }
      })
    }
    writeJson(path.join(root, 'config', 'localization-reviewed-corrections.json'), {
      version: 3,
      algorithm: 'classified-first-parent-target-only-current-value-v2',
      provenance: [],
      messages: Object.fromEntries(LOCALES.map((locale) => [locale, {}]))
    })

    await bootstrapLocalizationState(root, MIGRATION_ARGS, {
      environment: MIGRATION_ENVIRONMENT
    })
    const firstState = readFileSync(
      path.join(root, 'config', 'localization-state', 'es.json'),
      'utf8'
    )
    await bootstrapLocalizationState(root, MIGRATION_ARGS, {
      environment: MIGRATION_ENVIRONMENT
    })
    expect(readFileSync(path.join(root, 'config', 'localization-state', 'es.json'), 'utf8')).toBe(
      firstState
    )
    const state = JSON.parse(firstState)
    expect(state.messages['auto.example.filler']).toBeUndefined()
    expect(state.messages['auto.lib.agent.catalog.codex']).toEqual({
      state: 'intentional-english'
    })
    expect(state.messages['auto.example.machine']).toEqual({
      state: 'machine',
      sourceHash: sourceHash('Welcome')
    })
    expect(state.messages['auto.example.reviewed']).toEqual({
      state: 'reviewed',
      sourceHash: sourceHash('Explore Orca')
    })
    const target = JSON.parse(readFileSync(path.join(localesDir, 'es.json'), 'utf8'))
    expect(target.auto.example).toEqual({
      machine: 'translated-es',
      reviewed: 'Explorar Orca'
    })
    expect(target.auto.lib).toBeUndefined()
  })

  it('preserves reviewed target-only history for #6749 and #6706 fixtures', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'orca-localization-history-'))
    const localesDir = path.join(root, 'src', 'renderer', 'src', 'i18n', 'locales')
    mkdirSync(localesDir, { recursive: true })
    mkdirSync(path.join(root, 'config'), { recursive: true })
    runGit(root, ['init'])
    writeJson(path.join(localesDir, 'en.json'), {
      auto: {
        lib: { worktree: { palette: { search: { ca40ffcbec: 'PR' } } } },
        components: {
          right: { sidebar: { FileExplorerRow: { '2de3b21934': 'Explorer' } } }
        }
      }
    })
    for (const locale of LOCALES) {
      writeJson(path.join(localesDir, `${locale}.json`), {
        auto: {
          lib: {
            worktree: {
              palette: { search: { ca40ffcbec: locale === 'es' ? 'relaciones públicas' : 'PR' } }
            }
          },
          components: {
            right: {
              sidebar: {
                FileExplorerRow: {
                  '2de3b21934': locale === 'zh' ? '探险家' : `Explorer-${locale}`
                }
              }
            }
          }
        }
      })
    }
    commitAll(root, 'initial locale import')

    const es = JSON.parse(readFileSync(path.join(localesDir, 'es.json'), 'utf8'))
    es.auto.lib.worktree.palette.search.ca40ffcbec = 'PR'
    writeJson(path.join(localesDir, 'es.json'), es)
    commitAll(
      root,
      'fix(i18n): correct Spanish "PR" mistranslated as "relaciones públicas" (#6749)'
    )

    const zh = JSON.parse(readFileSync(path.join(localesDir, 'zh.json'), 'utf8'))
    zh.auto.components.right.sidebar.FileExplorerRow['2de3b21934'] = '资源管理器'
    writeJson(path.join(localesDir, 'zh.json'), zh)
    commitAll(root, 'fix(i18n): correct zh "Explorer" mistranslation (探险家 → 资源管理器) (#6706)')

    const zhCommit = runGit(root, ['rev-parse', 'HEAD']).trim()
    const esCommit = runGit(root, ['rev-parse', 'HEAD^']).trim()
    const ja = JSON.parse(readFileSync(path.join(localesDir, 'ja.json'), 'utf8'))
    ja.auto.components.right.sidebar.FileExplorerRow['2de3b21934'] = 'エクスプローラー'
    writeJson(path.join(localesDir, 'ja.json'), ja)
    commitAll(root, 'Apply bulk spacing and translation normalization')
    const bulkCommit = runGit(root, ['rev-parse', 'HEAD']).trim()
    const classifications = {
      version: 1,
      commits: {
        [esCommit]: {
          classification: 'reviewed-correction',
          reason: 'Single Spanish correction review.'
        },
        [zhCommit]: {
          classification: 'reviewed-correction',
          reason: 'Single Chinese correction review.'
        },
        [bulkCommit]: {
          classification: 'mechanical-or-bulk',
          reason: 'Synthetic bulk spacing pass.'
        }
      }
    }
    writeJson(
      path.join(root, 'config', 'localization-reviewed-commit-classifications.json'),
      classifications
    )
    writeJson(path.join(root, 'config', 'localization-reviewed-corrections.json'), {
      version: 3,
      algorithm: 'classified-first-parent-target-only-current-value-v2',
      provenance: [],
      messages: Object.fromEntries(LOCALES.map((locale) => [locale, {}]))
    })

    const initialGitProcesses = []
    await bootstrapLocalizationState(root, [...MIGRATION_ARGS, '--audit-reviewed-commits'], {
      environment: MIGRATION_ENVIRONMENT,
      onGitProcess: (args) => initialGitProcesses.push(args)
    })
    expect(initialGitProcesses).toHaveLength(3)
    const audit = JSON.parse(
      readFileSync(path.join(root, 'config', 'localization-reviewed-corrections.json'), 'utf8')
    )
    expect(audit.messages.es['auto.lib.worktree.palette.search.ca40ffcbec'].value).toBe('PR')
    expect(
      audit.messages.zh['auto.components.right.sidebar.FileExplorerRow.2de3b21934'].value
    ).toBe('资源管理器')
    expect(
      audit.messages.ja['auto.components.right.sidebar.FileExplorerRow.2de3b21934']
    ).toBeUndefined()
    expect(
      JSON.parse(readFileSync(path.join(root, 'config', 'localization-state', 'es.json'), 'utf8'))
        .messages['auto.lib.worktree.palette.search.ca40ffcbec'].state
    ).toBe('reviewed')
    expect(
      JSON.parse(readFileSync(path.join(root, 'config', 'localization-state', 'zh.json'), 'utf8'))
        .messages['auto.components.right.sidebar.FileExplorerRow.2de3b21934'].state
    ).toBe('reviewed')
    expect(
      JSON.parse(readFileSync(path.join(root, 'config', 'localization-state', 'ja.json'), 'utf8'))
        .messages['auto.components.right.sidebar.FileExplorerRow.2de3b21934'].state
    ).toBe('machine')

    for (let index = 0; index < 12; index += 1) {
      const growingEs = JSON.parse(readFileSync(path.join(localesDir, 'es.json'), 'utf8'))
      growingEs.auto.lib.worktree.palette.search.ca40ffcbec = `PR-${index}`
      writeJson(path.join(localesDir, 'es.json'), growingEs)
      commitAll(root, `grow localization history ${index}`)
      classifications.commits[runGit(root, ['rev-parse', 'HEAD']).trim()] = {
        classification: 'mechanical-or-bulk',
        reason: 'Synthetic bulk history growth.'
      }
    }
    const grownGitProcesses = []
    writeJson(
      path.join(root, 'config', 'localization-reviewed-commit-classifications.json'),
      classifications
    )
    await bootstrapLocalizationState(root, [...MIGRATION_ARGS, '--audit-reviewed-commits'], {
      environment: MIGRATION_ENVIRONMENT,
      onGitProcess: (args) => grownGitProcesses.push(args)
    })
    expect(grownGitProcesses).toHaveLength(initialGitProcesses.length)
  })
})
