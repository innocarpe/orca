import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import {
  collectLocalizationCandidates,
  main as verifyCoverage
} from './audit-localization-coverage.mjs'
import {
  collectLocalizationKeyReferences,
  collectLocalizationSourceFiles,
  parseLocalizationSource
} from './localization-source-references.mjs'
import { main as verifyCatalog } from './verify-localization-catalog.mjs'

const SOURCE_AREAS = [
  {
    root: path.join('src', 'renderer', 'src'),
    allowlist: path.join('config', 'localization-coverage-allowlist.json')
  },
  {
    root: path.join('src', 'main'),
    allowlist: path.join('config', 'localization-main-process-allowlist.json')
  }
]

export async function main(root = process.cwd()) {
  const references = []
  const preparedAreas = []

  // Why: product-owned checks share one read and AST per file; i18next-cli remains independent.
  for (const area of SOURCE_AREAS) {
    const files = await collectLocalizationSourceFiles(root, path.join(root, area.root))
    const reports = []
    for (const filePath of files) {
      const sourceText = await fs.readFile(filePath, 'utf8')
      const sourceFile = parseLocalizationSource(filePath, sourceText)
      references.push(collectLocalizationKeyReferences(filePath, sourceText, root, sourceFile))
      reports.push(...collectLocalizationCandidates(filePath, sourceText, root, sourceFile))
    }
    preparedAreas.push({ ...area, files, reports })
  }

  if ((await verifyCatalog(root, { fix: false, references: references.flat() })) !== 0) {
    return 1
  }
  for (const area of preparedAreas) {
    const result = await verifyCoverage(
      root,
      ['--source-root', area.root, '--allowlist', area.allowlist, '--check'],
      area
    )
    if (result !== 0) {
      return result
    }
  }
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main())
}
