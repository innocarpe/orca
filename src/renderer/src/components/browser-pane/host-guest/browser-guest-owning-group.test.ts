import { describe, expect, it, vi } from 'vitest'
import { focusOwningGroupForBrowserGuest } from './browser-guest-owning-group'

const browserTab = {
  contentType: 'browser' as const,
  entityId: 'page-1',
  groupId: 'group-2'
}

describe('focusOwningGroupForBrowserGuest', () => {
  it('focuses the split that owns the browser page', () => {
    const focusGroup = vi.fn()
    focusOwningGroupForBrowserGuest({
      worktreeId: 'wt-1',
      browserTabId: 'page-1',
      unifiedTabsByWorktree: { 'wt-1': [browserTab] },
      focusGroup
    })
    expect(focusGroup).toHaveBeenCalledTimes(1)
    expect(focusGroup).toHaveBeenCalledWith('wt-1', 'group-2')
  })

  it('does not move the focused split when the page is not in a group yet', () => {
    const focusGroup = vi.fn()
    focusOwningGroupForBrowserGuest({
      worktreeId: 'wt-1',
      browserTabId: 'page-1',
      unifiedTabsByWorktree: {
        'wt-1': [{ contentType: 'terminal', entityId: 'page-1', groupId: 'group-1' }]
      },
      focusGroup
    })
    expect(focusGroup).not.toHaveBeenCalled()
  })

  it('ignores the same page id on another worktree', () => {
    const focusGroup = vi.fn()
    focusOwningGroupForBrowserGuest({
      worktreeId: 'wt-1',
      browserTabId: 'page-1',
      unifiedTabsByWorktree: { 'wt-2': [browserTab] },
      focusGroup
    })
    expect(focusGroup).not.toHaveBeenCalled()
  })
})
