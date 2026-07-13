import {
  LOCALE_KEY_OVERRIDES,
  LOCALE_VALUE_OVERRIDES,
  NATIVE_PICKER_LABELS,
  SEARCH_KEYWORD_OVERRIDES
} from './locale-translation-policy.mjs'

export const LOCALIZATION_LOCALES = ['es', 'ja', 'ko', 'zh']

export function reviewedAuditValueMatches(entry, currentValue) {
  if (entry?.value === currentValue) {
    return true
  }
  // Why: this one-time reserved-token rename did not change reviewed target wording.
  return (
    entry?.reason === 'historical-target-only-correction' &&
    entry.value.includes('{{count}}') &&
    currentValue === entry.value.replaceAll('{{count}}', '{{value0}}')
  )
}

export function reviewedByPolicy(locale, key, enValue) {
  if (LOCALE_KEY_OVERRIDES[key]?.[locale] !== undefined) {
    return true
  }
  if (LOCALE_VALUE_OVERRIDES[locale]?.[enValue] !== undefined) {
    return true
  }
  if (key.includes('.search.') && SEARCH_KEYWORD_OVERRIDES[locale]?.[enValue] !== undefined) {
    return true
  }
  const pickerKey = key.replace('settings.appearance.language.', '')
  if (NATIVE_PICKER_LABELS[locale]?.[pickerKey] !== undefined) {
    return true
  }
  return key === 'menu.exploreOrca' || key === 'menu.gettingStarted'
}

export function validateReviewedAudit(audit) {
  const errors = []
  const reviewedCommits = new Set()
  if (Object.keys(audit).join('|') !== 'version|algorithm|provenance|messages') {
    errors.push('reviewed audit fields/order invalid')
  }
  if (audit.version !== 3) {
    errors.push('reviewed audit must use version 3')
  }
  if (audit.algorithm !== 'classified-first-parent-target-only-current-value-v2') {
    errors.push('reviewed audit algorithm unsupported')
  }
  if (!Array.isArray(audit.provenance)) {
    errors.push('reviewed audit provenance must be an array')
  } else {
    for (const entry of audit.provenance) {
      if (Object.keys(entry ?? {}).join('|') !== 'commit|subject|classification|reason') {
        errors.push('reviewed audit provenance entry fields invalid')
        continue
      }
      if (!['reviewed-correction', 'mechanical-or-bulk'].includes(entry.classification)) {
        errors.push(`reviewed audit provenance classification unsupported: ${entry.commit}`)
      }
      if (entry.classification === 'reviewed-correction') {
        reviewedCommits.add(entry.commit)
      }
    }
  }
  if (!audit.messages || typeof audit.messages !== 'object' || Array.isArray(audit.messages)) {
    return [...errors, 'reviewed audit messages invalid']
  }
  if (Object.keys(audit.messages).join('|') !== LOCALIZATION_LOCALES.join('|')) {
    errors.push('reviewed audit locale set/order invalid')
  }
  for (const locale of LOCALIZATION_LOCALES) {
    const messages = audit.messages[locale]
    if (!messages || typeof messages !== 'object' || Array.isArray(messages)) {
      errors.push(`reviewed audit ${locale} messages invalid`)
      continue
    }
    for (const [key, entry] of Object.entries(messages)) {
      if (entry?.reason === 'historical-target-only-correction') {
        if (
          Object.keys(entry ?? {}).join('|') !== 'value|commits|reason' ||
          typeof entry.value !== 'string' ||
          !Array.isArray(entry.commits) ||
          entry.commits.length === 0
        ) {
          errors.push(`reviewed audit ${locale}:${key} historical evidence invalid`)
        }
        for (const commit of entry.commits ?? []) {
          if (!/^[a-f0-9]{40}$/.test(commit) || !reviewedCommits.has(commit)) {
            errors.push(`reviewed audit ${locale}:${key} cites unreviewed commit ${commit}`)
          }
        }
      } else if (entry?.reason === 'localization-pr-review') {
        if (
          Object.keys(entry ?? {}).join('|') !== 'value|review|reason' ||
          typeof entry.value !== 'string' ||
          Object.keys(entry.review ?? {}).join('|') !== 'provider|changeId|reviewer' ||
          !['github', 'gitlab', 'other'].includes(entry.review?.provider) ||
          typeof entry.review?.changeId !== 'string' ||
          entry.review.changeId.trim().length === 0 ||
          typeof entry.review?.reviewer !== 'string' ||
          entry.review.reviewer.trim().length === 0
        ) {
          errors.push(`reviewed audit ${locale}:${key} localization PR evidence invalid`)
        }
      } else {
        errors.push(`reviewed audit ${locale}:${key} reason unsupported`)
      }
    }
  }
  return errors
}
