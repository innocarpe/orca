import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const OUTPUT_PATH = path.join('src', 'shared', 'localization-keys.ts')

function generatedSource() {
  return `import type sourceMessages from '../../config/localization-extraction/en.json'

type Join<Prefix extends string, Key extends string> = Prefix extends '' ? Key : \`\${Prefix}.\${Key}\`
type CatalogKey<T, Prefix extends string = ''> = {
  [Key in Extract<keyof T, string>]: T[Key] extends string
    ? Join<Prefix, Key>
    : T[Key] extends Record<string, unknown>
      ? CatalogKey<T[Key], Join<Prefix, Key>>
      : never
}[Extract<keyof T, string>]

// Why: deriving from the committed extractor output keeps key types generated without unchecked .d.ts files.
export type LocalizationKey = CatalogKey<typeof sourceMessages>
`
}

export async function main(root = process.cwd(), argv = process.argv.slice(2)) {
  const outputPath = path.join(root, OUTPUT_PATH)
  const expected = generatedSource()
  if (argv.includes('--fix')) {
    await fs.writeFile(outputPath, expected)
    return 0
  }
  let current
  try {
    current = await fs.readFile(outputPath, 'utf8')
  } catch {
    console.error(`${OUTPUT_PATH} is missing. Run pnpm run sync:localization-key-types.`)
    return 1
  }
  if (current !== expected) {
    console.error(`${OUTPUT_PATH} is out of date. Run pnpm run sync:localization-key-types.`)
    return 1
  }
  console.log(`Verified generated localization key types: ${OUTPUT_PATH}.`)
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main())
}
