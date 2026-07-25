import type { AppState } from '@/store/types'

export type TerminalTabPtyOwnershipState = Pick<
  AppState,
  'tabsByWorktree' | 'terminalLayoutsByTabId' | 'ptyIdsByTabId'
>

/** Resolve a synthetic mobile handle's ptyId through live and persisted tab bindings. */
export function resolveTerminalTabIdForPtyId(
  state: TerminalTabPtyOwnershipState,
  worktreeId: string,
  ptyId: string
): string | null {
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
      return null
    }
    resolvedTabId = tab.id
  }
  return resolvedTabId
}
