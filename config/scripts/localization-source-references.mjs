import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'

// TypeScript 7 is a native CLI; AST consumers still need the legacy JavaScript API.
import ts from 'typescript-api'

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts'])
const SKIP_PATH_PARTS = new Set(['.git', 'dist', 'node_modules', 'out', '__snapshots__', 'assets'])
const LOCALIZATION_FUNCTION_NAMES = new Set(['t', 'translate', 'translateMain'])
const PLACEHOLDER_RE = /\{\{[^}]+\}\}/g
const I18NEXT_OPTION_NAMES = new Set([
  'count',
  'defaultValue',
  'fallbackLng',
  'interpolation',
  'joinArrays',
  'lng',
  'ns',
  'returnDetails',
  'returnObjects'
])
const PLACEHOLDER_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/
const RESERVED_PLACEHOLDER_NAMES = new Set(I18NEXT_OPTION_NAMES)

function normalizePath(root, filePath) {
  return path.relative(root, filePath).split(path.sep).join('/')
}

function isSkippedFile(root, filePath) {
  const relative = normalizePath(root, filePath)
  if (
    relative.endsWith('.d.ts') ||
    relative.includes('.test.') ||
    relative.includes('.spec.') ||
    relative.includes('/__tests__/')
  ) {
    return true
  }
  return relative.split('/').some((part) => SKIP_PATH_PARTS.has(part))
}

export async function collectLocalizationSourceFiles(root, dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_PATH_PARTS.has(entry.name)) {
        files.push(...(await collectLocalizationSourceFiles(root, fullPath)))
      }
      continue
    }
    if (
      entry.isFile() &&
      SOURCE_EXTENSIONS.has(path.extname(entry.name)) &&
      !isSkippedFile(root, fullPath)
    ) {
      files.push(fullPath)
    }
  }

  return files
}

export function expressionNameText(node) {
  if (ts.isIdentifier(node)) {
    return node.text
  }
  if (ts.isPropertyAccessExpression(node)) {
    return `${expressionNameText(node.expression) ?? ''}.${node.name.text}`.replace(/^\./, '')
  }
  return undefined
}

function reportAt(root, filePath, sourceFile, node, key, fallback) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  return {
    filePath: normalizePath(root, filePath),
    line: position.line + 1,
    column: position.character + 1,
    key,
    fallback,
    options: undefined
  }
}

function propertyNameText(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text
  }
  return undefined
}

function staticStringBranches(node) {
  if (!node) {
    return []
  }
  if (ts.isStringLiteralLike(node)) {
    return [node.text]
  }
  if (ts.isConditionalExpression(node)) {
    return [...staticStringBranches(node.whenTrue), ...staticStringBranches(node.whenFalse)]
  }
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    return staticStringBranches(node.expression)
  }
  return []
}

function objectLiteralStringBranches(node, propertyName) {
  if (!node || !ts.isObjectLiteralExpression(node)) {
    return []
  }
  for (const property of node.properties) {
    if (ts.isPropertyAssignment(property) && propertyNameText(property.name) === propertyName) {
      return staticStringBranches(property.initializer)
    }
  }
  return []
}

function collectOptionNames(node) {
  if (!node || !ts.isObjectLiteralExpression(node)) {
    return { kind: node ? 'dynamic' : 'missing', names: new Set() }
  }
  const names = new Set()
  let dynamic = false
  for (const property of node.properties) {
    if (ts.isSpreadAssignment(property)) {
      dynamic = true
      continue
    }
    if (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) {
      const name = propertyNameText(property.name)
      if (name) {
        names.add(name)
      } else {
        dynamic = true
      }
      continue
    }
    dynamic = true
  }
  return { kind: dynamic ? 'mixed' : 'object', names }
}

function localizationCallRecord(root, filePath, sourceFile, callExpression) {
  const name = expressionNameText(callExpression.expression)
  const functionName = name?.split('.').at(-1)
  const firstArg = callExpression.arguments[0]
  if (!functionName || !LOCALIZATION_FUNCTION_NAMES.has(functionName) || !firstArg) {
    return undefined
  }
  const key = ts.isStringLiteralLike(firstArg) ? firstArg.text : undefined

  let fallback
  let fallbacks
  let options
  if (functionName === 't') {
    const secondArg = callExpression.arguments[1]
    fallbacks = objectLiteralStringBranches(secondArg, 'defaultValue')
    fallback = fallbacks.length === 1 ? fallbacks[0] : undefined
    options = collectOptionNames(secondArg)
  } else {
    const secondArg = callExpression.arguments[1]
    fallbacks = staticStringBranches(secondArg)
    fallback = fallbacks.length === 1 ? fallbacks[0] : undefined
    options = collectOptionNames(callExpression.arguments[2])
  }

  return {
    ...reportAt(root, filePath, sourceFile, firstArg, key, fallback),
    options,
    fallbacks,
    callText:
      key === undefined
        ? ts
            .createPrinter({ removeComments: true })
            .printNode(ts.EmitHint.Unspecified, callExpression, sourceFile)
        : undefined
  }
}

export function parseLocalizationSource(filePath, sourceText) {
  const sourceKind =
    filePath.endsWith('.tsx') || filePath.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  return ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, sourceKind)
}

export function collectLocalizationKeyReferences(
  filePath,
  sourceText,
  root = process.cwd(),
  sourceFile = parseLocalizationSource(filePath, sourceText)
) {
  const references = []

  function visit(node) {
    if (ts.isCallExpression(node)) {
      const record = localizationCallRecord(root, filePath, sourceFile, node)
      if (record) {
        references.push(record)
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  const occurrences = new Map()
  for (const reference of references.filter(({ key }) => key === undefined)) {
    const digest = createHash('sha256').update(reference.callText).digest('hex')
    const base = `${reference.filePath}#sha256:${digest}`
    const occurrence = (occurrences.get(base) ?? 0) + 1
    occurrences.set(base, occurrence)
    reference.dynamicSignature = `${base}#${occurrence}`
    delete reference.callText
  }
  return references
}

export function collectInterpolationVariables(value) {
  if (typeof value === 'string') {
    const matches = value.match(PLACEHOLDER_RE) ?? []
    return [...matches].sort()
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return []
  }
  return Object.values(value).flatMap((child) => collectInterpolationVariables(child))
}

function interpolationVariableNames(value) {
  return collectInterpolationVariables(value).map((variable) => variable.slice(2, -2))
}

export function collectCallSitePlaceholderErrors(references) {
  const errors = []
  for (const reference of references) {
    const fallbacks = reference.fallbacks?.length
      ? [...new Set(reference.fallbacks)]
      : typeof reference.fallback === 'string'
        ? [reference.fallback]
        : []
    if (fallbacks.length === 0) {
      continue
    }
    const placeholders = [...new Set(fallbacks.flatMap(interpolationVariableNames))]
    for (const placeholder of placeholders) {
      if (!PLACEHOLDER_NAME_RE.test(placeholder)) {
        errors.push({ reference, message: `invalid placeholder name {{${placeholder}}}` })
      }
      if (RESERVED_PLACEHOLDER_NAMES.has(placeholder)) {
        errors.push({
          reference,
          message: `placeholder {{${placeholder}}} collides with a reserved i18next option name`
        })
      }
    }
    if (placeholders.length === 0) {
      continue
    }
    if (!reference.options || reference.options.kind === 'missing') {
      errors.push({
        reference,
        message: `missing interpolation options for ${placeholders
          .map((name) => `{{${name}}}`)
          .join(', ')}`
      })
      continue
    }
    if (reference.options.kind !== 'object') {
      errors.push({ reference, message: 'interpolation options must be a static object literal' })
      continue
    }
    const missing = placeholders.filter((placeholder) => !reference.options.names.has(placeholder))
    for (const missingName of missing) {
      errors.push({ reference, message: `missing interpolation value "${missingName}"` })
    }
    const invalidOptionNames = [...reference.options.names].filter(
      (optionName) => !I18NEXT_OPTION_NAMES.has(optionName) && !PLACEHOLDER_NAME_RE.test(optionName)
    )
    for (const optionName of invalidOptionNames) {
      errors.push({ reference, message: `invalid interpolation option name "${optionName}"` })
    }
  }
  return errors
}

export function formatPlaceholderErrors(errors) {
  return errors
    .map(
      ({ reference, message }) =>
        `${reference.filePath}:${reference.line}:${reference.column} ${reference.key}: ${message}`
    )
    .join('\n')
}
