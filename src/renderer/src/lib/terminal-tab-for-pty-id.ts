import type { AppState } from '@/store/types'

export type TerminalTabPtyOwnershipState = Pick<
  AppState,
  'tabsByWorktree' | 'terminalLayoutsByTabId' | 'ptyIdsByTabId'
>

/** Ownership of a PTY across tabs in one worktree. Ambiguous ≠ unowned. */
export type TerminalTabPtyOwnership =
  | { kind: 'owned'; tabId: string }
  | { kind: 'none' }
  | { kind: 'ambiguous' }

/** Resolve a PTY through live and persisted tab bindings; never pick first-of-many. */
export function resolveTerminalTabPtyOwnership(
  state: TerminalTabPtyOwnershipState,
  worktreeId: string,
  ptyId: string
): TerminalTabPtyOwnership {
  const tabs = state.tabsByWorktree[worktreeId] ?? []
  let resolvedTabId: string | null = null
  for (const tab of tabs) {
    const ptyIdsByLeafId = state.terminalLayoutsByTabId[tab.id]?.ptyIdsByLeafId
    // Why (#10486): mobile focus/reveal can race layout hydration; the live
    // ptyIdsByTabId map still owns the binding when layout rows are empty.
    const ownsPty =
      tab.ptyId === ptyId ||
      (state.ptyIdsByTabId[tab.id] ?? []).includes(ptyId) ||
      (ptyIdsByLeafId !== undefined && Object.values(ptyIdsByLeafId).includes(ptyId))
    if (!ownsPty) {
      continue
    }
    if (resolvedTabId && resolvedTabId !== tab.id) {
      // Why: stale duplicate ownership must not attach whichever hidden tab
      // happens to appear first in persisted order.
      return { kind: 'ambiguous' }
    }
    resolvedTabId = tab.id
  }
  return resolvedTabId ? { kind: 'owned', tabId: resolvedTabId } : { kind: 'none' }
}

/** Resolve a synthetic mobile handle's ptyId; null for none or ambiguous. */
export function resolveTerminalTabIdForPtyId(
  state: TerminalTabPtyOwnershipState,
  worktreeId: string,
  ptyId: string
): string | null {
  const ownership = resolveTerminalTabPtyOwnership(state, worktreeId, ptyId)
  return ownership.kind === 'owned' ? ownership.tabId : null
}
