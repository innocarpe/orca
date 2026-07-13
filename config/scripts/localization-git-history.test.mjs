import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { collectReviewedCorrectionHistory } from './localization-git-history.mjs'

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
}

function commit(root, subject) {
  git(root, ['add', '.'])
  git(root, [
    '-c',
    'user.name=Orca Test',
    '-c',
    'user.email=orca@example.com',
    'commit',
    '-m',
    subject
  ])
}

describe('localization git history', () => {
  it('derives revision offsets when a fifth locale is present', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'orca-localization-five-locales-'))
    const localeDir = path.join(root, 'locales')
    const locales = ['es', 'ja', 'ko', 'zh', 'fr']
    mkdirSync(localeDir, { recursive: true })
    git(root, ['init'])
    writeFileSync(path.join(localeDir, 'en.json'), '{"message":"Hello"}\n')
    for (const locale of locales) {
      writeFileSync(path.join(localeDir, `${locale}.json`), `{"message":"${locale}-old"}\n`)
    }
    commit(root, 'Initial locale import')
    const frPath = path.join(localeDir, 'fr.json')
    const fr = JSON.parse(readFileSync(frPath, 'utf8'))
    fr.message = 'fr-reviewed'
    writeFileSync(frPath, `${JSON.stringify(fr)}\n`)
    commit(root, 'Review French translation')
    const reviewedCommit = git(root, ['rev-parse', 'HEAD'])
    const paths = ['en', ...locales].map((locale) => `locales/${locale}.json`)
    await expect(
      collectReviewedCorrectionHistory(root, locales, paths, { version: 1, commits: {} })
    ).rejects.toThrow('Unclassified localization provenance commit')
    const result = await collectReviewedCorrectionHistory(root, locales, paths, {
      version: 1,
      commits: {
        [reviewedCommit]: {
          classification: 'reviewed-correction',
          reason: 'Reviewed French correction.'
        }
      }
    })
    expect(result.messages.fr.get('message')?.value).toBe('fr-reviewed')
  })
})
