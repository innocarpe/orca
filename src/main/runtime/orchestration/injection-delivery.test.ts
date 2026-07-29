import { describe, expect, it } from 'vitest'
import {
  isOrchestrationLeafUserFocused,
  shouldDeferOrchestrationInjection,
  shouldSynthesizeOrchestrationEnter
} from './injection-delivery'

describe('shouldDeferOrchestrationInjection', () => {
  it('defers when the leaf is user-focused', () => {
    expect(shouldDeferOrchestrationInjection({ isUserFocused: true })).toBe(true)
  })

  it('does not defer unfocused leaves', () => {
    expect(shouldDeferOrchestrationInjection({ isUserFocused: false })).toBe(false)
  })
})

describe('isOrchestrationLeafUserFocused', () => {
  it('is false when no active tab is known', () => {
    expect(
      isOrchestrationLeafUserFocused({
        leafTabId: 'tab-1',
        leafId: 'pane:1',
        activeTabId: null,
        activeLeafId: 'pane:1'
      })
    ).toBe(false)
  })

  it('is false when a different tab is active for the worktree', () => {
    expect(
      isOrchestrationLeafUserFocused({
        leafTabId: 'tab-1',
        leafId: 'pane:1',
        activeTabId: 'tab-other',
        activeLeafId: 'pane:1'
      })
    ).toBe(false)
  })

  it('is true when the active tab matches and activeLeafId is null', () => {
    expect(
      isOrchestrationLeafUserFocused({
        leafTabId: 'tab-1',
        leafId: 'pane:1',
        activeTabId: 'tab-1',
        activeLeafId: null
      })
    ).toBe(true)
  })

  it('is true when the active tab and leaf both match', () => {
    expect(
      isOrchestrationLeafUserFocused({
        leafTabId: 'tab-1',
        leafId: 'pane:1',
        activeTabId: 'tab-1',
        activeLeafId: 'pane:1'
      })
    ).toBe(true)
  })

  it('is false when the active tab matches but a sibling leaf is focused', () => {
    expect(
      isOrchestrationLeafUserFocused({
        leafTabId: 'tab-1',
        leafId: 'pane:1',
        activeTabId: 'tab-1',
        activeLeafId: 'pane:2'
      })
    ).toBe(false)
  })
})

describe('shouldSynthesizeOrchestrationEnter', () => {
  const workerBase = {
    isUserFocused: false,
    isActiveCoordinator: false,
    isCursorTarget: false,
    hasActiveCoordinatorRun: true
  }

  it('synthesizes Enter for unattended worker panes under an active run', () => {
    expect(shouldSynthesizeOrchestrationEnter(workerBase)).toBe(true)
  })

  it('skips Enter when there is no active coordinator run', () => {
    expect(
      shouldSynthesizeOrchestrationEnter({ ...workerBase, hasActiveCoordinatorRun: false })
    ).toBe(false)
  })

  it('skips Enter for the active coordinator pane', () => {
    expect(shouldSynthesizeOrchestrationEnter({ ...workerBase, isActiveCoordinator: true })).toBe(
      false
    )
  })

  it('skips Enter for Cursor Agent targets', () => {
    expect(shouldSynthesizeOrchestrationEnter({ ...workerBase, isCursorTarget: true })).toBe(false)
  })

  it('skips Enter when the leaf is user-focused', () => {
    expect(shouldSynthesizeOrchestrationEnter({ ...workerBase, isUserFocused: true })).toBe(false)
  })
})
