import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  collectCallSitePlaceholderErrors,
  collectLocalizationKeyReferences
} from './localization-source-references.mjs'

const ROOT = path.join(path.parse(process.cwd()).root, 'workspace')
const FILE = path.join(ROOT, 'src', 'renderer', 'src', 'Example.tsx')

function references(source) {
  return collectLocalizationKeyReferences(FILE, source, ROOT)
}

describe('localization source references', () => {
  it('validates every bounded fallback branch for dynamic keys', () => {
    const [reference] = references(
      "translate(one ? 'auto.one' : 'auto.many', one ? '{{value0}} item' : '{{value0}} items', { count })"
    )
    expect(collectCallSitePlaceholderErrors([reference])).toEqual([
      expect.objectContaining({ message: 'missing interpolation value "value0"' })
    ])
  })

  it('keeps semantic signatures stable across line insertions and normalizes paths', () => {
    const first = references("translate(key, 'Value')")[0].dynamicSignature
    const shifted = references("\n\ntranslate(key, 'Value')")[0].dynamicSignature
    expect(shifted).toBe(first)
    expect(first).not.toContain('\\')
  })

  it('changes signatures with the call and disambiguates duplicates by occurrence', () => {
    const original = references("translate(key, 'Value')")[0].dynamicSignature
    const changed = references("translate(otherKey, 'Value')")[0].dynamicSignature
    const duplicates = references("translate(key, 'Value')\ntranslate(key, 'Value')")
    expect(changed).not.toBe(original)
    expect(duplicates.map(({ dynamicSignature }) => dynamicSignature.at(-1))).toEqual(['1', '2'])
  })
})
