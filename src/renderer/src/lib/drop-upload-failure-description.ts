import { basename } from './path'

export type DropUploadFailure = {
  sourcePath: string
  reason: string
}

const MAX_VISIBLE_DROP_FAILURES = 2

export function formatDropUploadFailureDescription(failed: readonly DropUploadFailure[]): string {
  const visible = failed.slice(0, MAX_VISIBLE_DROP_FAILURES).map((failure) => {
    return `${basename(failure.sourcePath)}: ${failure.reason}`
  })
  const hiddenCount = failed.length - visible.length
  if (hiddenCount > 0) {
    visible.push(`+${hiddenCount} more failure${hiddenCount === 1 ? '' : 's'}`)
  }
  return visible.join('\n')
}
