import { basename } from './path'
import { translate } from '@/i18n/i18n'

export type DropUploadFailure = {
  sourcePath: string
  reason: string
}

const MAX_VISIBLE_DROP_FAILURES = 2

const SAFE_FAILURE_REASON_COPY: Readonly<Record<string, { key: string; fallback: string }>> = {
  'File is too large': {
    key: 'auto.lib.dropUploadFailure.fileTooLarge',
    fallback: 'File is too large'
  },
  missing: {
    key: 'auto.lib.dropUploadFailure.missing',
    fallback: 'File not found.'
  },
  'permission denied': {
    key: 'auto.lib.dropUploadFailure.permissionDenied',
    fallback: 'Permission denied.'
  },
  'disk full': {
    key: 'auto.lib.dropUploadFailure.storageFull',
    fallback: 'Not enough storage.'
  },
  unsupported: {
    key: 'auto.lib.dropUploadFailure.unsupported',
    fallback: 'Unsupported file type.'
  },
  'Runtime connection changed; retry the import.': {
    key: 'auto.lib.dropUploadFailure.connectionChanged',
    fallback: 'Remote connection changed; retry the import.'
  },
  'Runtime pairing changed; retry the import.': {
    key: 'auto.lib.dropUploadFailure.pairingChanged',
    fallback: 'Remote pairing changed; retry the import.'
  }
}

function formatDropUploadFailureReason(reason: string): string {
  const copy = SAFE_FAILURE_REASON_COPY[reason]
  return copy
    ? translate(copy.key, copy.fallback)
    : translate('auto.lib.dropUploadFailure.generic', 'Upload failed.')
}

export function formatDropUploadFailureDescription(failed: readonly DropUploadFailure[]): string {
  const visible = failed.slice(0, MAX_VISIBLE_DROP_FAILURES).map((failure) => {
    return `${basename(failure.sourcePath)}: ${formatDropUploadFailureReason(failure.reason)}`
  })
  const hiddenCount = failed.length - visible.length
  if (hiddenCount > 0) {
    visible.push(
      translate('auto.lib.dropUploadFailure.more', '+{{value0}} more failure{{value1}}', {
        value0: hiddenCount,
        value1: hiddenCount === 1 ? '' : 's'
      })
    )
  }
  return visible.join('\n')
}
