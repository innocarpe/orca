import { describe, expect, it } from 'vitest'
import {
  resolveTerminalTabIdForPtyId,
  resolveTerminalTabPtyOwnership
} from './terminal-tab-for-pty-id'
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

describe('resolveTerminalTabPtyOwnership', () => {
  it('matches a tab by its own ptyId', () => {
    const s = state({
      tabs: {
        wt: [
          { id: 'tab-a', ptyId: 'wt@@1' },
          { id: 'tab-b', ptyId: 'wt@@2' }
        ]
      }
    })
    expect(resolveTerminalTabPtyOwnership(s, 'wt', 'wt@@2')).toEqual({
      kind: 'owned',
      tabId: 'tab-b'
    })
  })

  it('matches a tab by a split leaf ptyId in its saved layout', () => {
    const s = state({
      tabs: { wt: [{ id: 'tab-a', ptyId: null }] },
      layouts: { 'tab-a': { ptyIdsByLeafId: { leaf1: 'wt@@1', leaf2: 'wt@@9' } } }
    })
    expect(resolveTerminalTabPtyOwnership(s, 'wt', 'wt@@9')).toEqual({
      kind: 'owned',
      tabId: 'tab-a'
    })
  })

  it('matches a tab via the live ptyIdsByTabId map when layout is empty', () => {
    const s = state({
      tabs: { wt: [{ id: 'tab-live', ptyId: null }] },
      ptyIdsByTabId: { 'tab-live': ['wt@@live'] }
    })
    expect(resolveTerminalTabPtyOwnership(s, 'wt', 'wt@@live')).toEqual({
      kind: 'owned',
      tabId: 'tab-live'
    })
  })

  it('returns none when no tab owns the ptyId', () => {
    const s = state({ tabs: { wt: [{ id: 'tab-a', ptyId: 'wt@@1' }] } })
    expect(resolveTerminalTabPtyOwnership(s, 'wt', 'wt@@nope')).toEqual({ kind: 'none' })
  })

  it('returns ambiguous when stale persistence binds the ptyId to multiple tabs', () => {
    const s = state({
      tabs: {
        wt: [
          { id: 'tab-a', ptyId: 'wt@@1' },
          { id: 'tab-b', ptyId: null }
        ]
      },
      layouts: { 'tab-b': { ptyIdsByLeafId: { leaf2: 'wt@@1' } } }
    })
    expect(resolveTerminalTabPtyOwnership(s, 'wt', 'wt@@1')).toEqual({ kind: 'ambiguous' })
  })

  it('returns none for an unknown worktree', () => {
    const s = state({ tabs: { wt: [{ id: 'tab-a', ptyId: 'wt@@1' }] } })
    expect(resolveTerminalTabPtyOwnership(s, 'other', 'wt@@1')).toEqual({ kind: 'none' })
  })
})

describe('resolveTerminalTabIdForPtyId', () => {
  it('returns the owning tab id when ownership is unique', () => {
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

  it('returns null for none and for ambiguous ownership', () => {
    const none = state({ tabs: { wt: [{ id: 'tab-a', ptyId: 'wt@@1' }] } })
    expect(resolveTerminalTabIdForPtyId(none, 'wt', 'wt@@nope')).toBeNull()

    const ambiguous = state({
      tabs: {
        wt: [
          { id: 'tab-a', ptyId: 'wt@@1' },
          { id: 'tab-b', ptyId: null }
        ]
      },
      layouts: { 'tab-b': { ptyIdsByLeafId: { leaf2: 'wt@@1' } } }
    })
    expect(resolveTerminalTabIdForPtyId(ambiguous, 'wt', 'wt@@1')).toBeNull()
  })
})
