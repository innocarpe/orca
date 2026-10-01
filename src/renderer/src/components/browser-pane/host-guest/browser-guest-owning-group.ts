import type { Tab } from '../../../../../shared/tab-types'

type BrowserGuestTab = Pick<Tab, 'contentType' | 'entityId' | 'groupId'>

/** The split that owns this browser page, or undefined while the tab is mid-move. */
export function owningGroupIdForBrowserGuest(
  tabs: readonly BrowserGuestTab[] | undefined,
  browserTabId: string
): string | undefined {
  for (const tab of tabs ?? []) {
    if (tab.contentType === 'browser' && tab.entityId === browserTabId) {
      return tab.groupId
    }
  }
  return undefined
}

/**
 * Guest webview focus does not bubble to the overlay, so Ctrl+Tab would keep
 * the previously focused split (#22144). Address-bar focus never reaches here.
 */
export function focusOwningGroupForBrowserGuest(args: {
  worktreeId: string
  browserTabId: string
  unifiedTabsByWorktree: Readonly<Record<string, readonly BrowserGuestTab[] | undefined>>
  focusGroup: (worktreeId: string, groupId: string) => void
}): void {
  const groupId = owningGroupIdForBrowserGuest(
    args.unifiedTabsByWorktree[args.worktreeId],
    args.browserTabId
  )
  if (!groupId) {
    return
  }
  args.focusGroup(args.worktreeId, groupId)
}
