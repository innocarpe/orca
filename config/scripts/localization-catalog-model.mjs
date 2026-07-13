import { createHash } from 'node:crypto'

import { compareCodeUnits } from './localization-code-unit-order.mjs'

export function flattenCatalog(value, prefix = '', entries = new Map()) {
  if (typeof value === 'string') {
    entries.set(prefix, value)
    return entries
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return entries
  }
  for (const [key, child] of Object.entries(value)) {
    flattenCatalog(child, prefix ? `${prefix}.${key}` : key, entries)
  }
  return entries
}

export function catalogFromEntries(entries) {
  const catalog = {}
  for (const [key, value] of [...entries].sort(([left], [right]) =>
    compareCodeUnits(left, right)
  )) {
    const parts = key.split('.')
    let cursor = catalog
    for (const part of parts.slice(0, -1)) {
      cursor[part] ??= {}
      cursor = cursor[part]
    }
    cursor[parts.at(-1)] = value
  }
  return catalog
}

export function deleteCatalogEntry(catalog, key) {
  const parts = key.split('.')
  const parents = []
  let cursor = catalog
  for (const part of parts.slice(0, -1)) {
    if (!cursor?.[part] || typeof cursor[part] !== 'object') {
      return
    }
    parents.push([cursor, part])
    cursor = cursor[part]
  }
  delete cursor[parts.at(-1)]
  for (const [parent, part] of parents.toReversed()) {
    if (Object.keys(parent[part]).length === 0) {
      delete parent[part]
    }
  }
}

export function setCatalogEntry(catalog, key, value) {
  const parts = key.split('.')
  let cursor = catalog
  for (const part of parts.slice(0, -1)) {
    cursor[part] ??= {}
    cursor = cursor[part]
  }
  cursor[parts.at(-1)] = value
}

export function getCatalogEntry(catalog, key) {
  return key.split('.').reduce((cursor, part) => cursor?.[part], catalog)
}

export function sortedObject(value) {
  if (Array.isArray(value)) {
    return value.map(sortedObject)
  }
  if (!value || typeof value !== 'object') {
    return value
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([key, child]) => [key, sortedObject(child)])
  )
}

export function sourceHash(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`
}

export function stateDocument(locale, messages) {
  return {
    version: 1,
    locale,
    messages: Object.fromEntries(
      [...messages].sort(([left], [right]) => compareCodeUnits(left, right))
    )
  }
}

export function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}
