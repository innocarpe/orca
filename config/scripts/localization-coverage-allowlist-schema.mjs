const LEGACY_GENERIC_ALLOWLIST_REASON =
  'Pre-existing main-process candidate retained for explicit follow-up disposition.'

const ALLOWLIST_CLASSIFICATIONS = new Set([
  'agent-rpc-schema-message',
  'branded-or-platform-literal',
  'diagnostic-or-log',
  'external-protocol-literal',
  'fixture-data',
  'product-copy-pending-localization',
  'provider-copy-pending-localization'
])

export function allowlistEntryForCandidate(candidate) {
  return {
    filePath: candidate.filePath,
    kind: candidate.kind,
    text: candidate.text,
    dynamic: candidate.dynamic,
    count: candidate.count,
    classification: 'pending-human-classification',
    reason: `Pending explicit localization-owner classification for ${candidate.filePath}: ${JSON.stringify(candidate.text)}.`
  }
}

export function validateAllowlist(allowlist) {
  const errors = []
  if (!Array.isArray(allowlist)) {
    return ['localization allowlist must be an array']
  }
  for (const [index, entry] of allowlist.entries()) {
    const label = entry?.filePath
      ? `${entry.filePath}:${entry.kind}:${JSON.stringify(entry.text)}`
      : `entry ${index}`
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`${label} must be an object`)
      continue
    }
    for (const field of ['filePath', 'kind', 'text', 'reason', 'classification']) {
      if (typeof entry[field] !== 'string' || entry[field].trim() === '') {
        errors.push(`${label} has invalid ${field}`)
      }
    }
    if (typeof entry.dynamic !== 'boolean') {
      errors.push(`${label} has invalid dynamic flag`)
    }
    if (!Number.isInteger(entry.count) || entry.count <= 0) {
      errors.push(`${label} has invalid count`)
    }
    if (!ALLOWLIST_CLASSIFICATIONS.has(entry.classification)) {
      errors.push(`${label} has unsupported classification ${JSON.stringify(entry.classification)}`)
    }
    if (entry.reason === LEGACY_GENERIC_ALLOWLIST_REASON) {
      errors.push(`${label} uses the legacy generic allowlist reason`)
    }
    if (typeof entry.reason === 'string' && !entry.reason.includes(entry.filePath)) {
      errors.push(`${label} reason must name its source file`)
    }
    if (typeof entry.reason === 'string' && !entry.reason.includes(JSON.stringify(entry.text))) {
      errors.push(`${label} reason must name its source text`)
    }
  }
  return errors
}
