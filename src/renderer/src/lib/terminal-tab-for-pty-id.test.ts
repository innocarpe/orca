import { describe, expect, it } from 'vitest'
import { resolveTerminalTabIdForPtyId } from './terminal-tab-for-pty-id'
import type { AppState } from '@/store/types'

type ResolverState = Pick<AppState, 'tabsByWorktree' | 'terminalLayoutsByTabId' | 'ptyIdsByTabId'>

function state(partial: {
  tabs?: Record<string, { id: string; ptyId?: string | null }[]>
  layouts?: Record<string, { ptyIdsByLeafId?: Record<string, string> }>
  ptyIdsByTabId?: Record<string, string[]>
}): ResolverState {
  return {
    tabsByWorktree: (partial.tabs ?? {}) as unknown as AppState['tabsByWorktree'],
    terminalLayoutsByTabId: (partial.layouts ??
      {}) as unknown as AppState['terminalLayoutsByTabId'],
    ptyIdsByTabId: partial.ptyIdsByTabId ?? {}
  }
}

describe('resolveTerminalTabIdForPtyId', () => {
  it('matches a tab by its own ptyId', () => {
    const s = state({
      tabs: {
        wt: [
          { id: 'tab-a', ptyId: 'wt@@1' },
          { id: 'tab-b', ptyId: 'wt@@2' }
        ]
      }
    })
    expect(resolveTerminalTabIdForPtyId(s, 'wt', 'wt@@2')).toBe('tab-b')
  })

  it('matches a tab by a split leaf ptyId in its saved layout', () => {
    const s = state({
      tabs: { wt: [{ id: 'tab-a', ptyId: null }] },
      layouts: { 'tab-a': { ptyIdsByLeafId: { leaf1: 'wt@@1', leaf2: 'wt@@9' } } }
    })
    expect(resolveTerminalTabIdForPtyId(s, 'wt', 'wt@@9')).toBe('tab-a')
  })

  it('matches a tab via the live ptyIdsByTabId map when layout is empty', () => {
    const s = state({
      tabs: { wt: [{ id: 'tab-live', ptyId: null }] },
      ptyIdsByTabId: { 'tab-live': ['wt@@live'] }
    })
    expect(resolveTerminalTabIdForPtyId(s, 'wt', 'wt@@live')).toBe('tab-live')
  })

  it('returns null when no tab owns the ptyId', () => {
    const s = state({ tabs: { wt: [{ id: 'tab-a', ptyId: 'wt@@1' }] } })
    expect(resolveTerminalTabIdForPtyId(s, 'wt', 'wt@@nope')).toBeNull()
  })

  it('returns null when stale persistence binds the ptyId to multiple tabs', () => {
    const s = state({
      tabs: {
        wt: [
          { id: 'tab-a', ptyId: 'wt@@1' },
          { id: 'tab-b', ptyId: null }
        ]
      },
      layouts: { 'tab-b': { ptyIdsByLeafId: { leaf2: 'wt@@1' } } }
    })
    expect(resolveTerminalTabIdForPtyId(s, 'wt', 'wt@@1')).toBeNull()
  })

  it('returns null for an unknown worktree', () => {
    const s = state({ tabs: { wt: [{ id: 'tab-a', ptyId: 'wt@@1' }] } })
    expect(resolveTerminalTabIdForPtyId(s, 'other', 'wt@@1')).toBeNull()
  })
})
