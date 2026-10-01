import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildStoreState,
  FUTURE_LEAF_ID,
  FUTURE_PANE_KEY,
  installMockAgentStatusTransaction,
  type StoreLike,
  type StoreSubscribeListener
} from '../ipc-events-agent-status-store-test-fixtures'

const SNAPSHOT_ENTRY = {
  paneKey: FUTURE_PANE_KEY,
  worktreeId: 'wt-1',
  terminalHandle: 'term-1',
  state: 'working' as const,
  agentType: 'opencode',
  providerSession: { key: 'session_id' as const, id: 'ses_1' },
  receivedAt: 1_700_000_000_000,
  stateStartedAt: 1_700_000_000_000
}

function routedTabs(state: StoreLike): void {
  state.tabsByWorktree = {
    'wt-1': [{ id: 'tab-future', ptyId: 'pty-1', worktreeId: 'wt-1', title: 'Future' }]
  }
  state.terminalLayoutsByTabId = {
    'tab-future': {
      root: { type: 'leaf', leafId: FUTURE_LEAF_ID },
      activeLeafId: FUTURE_LEAF_ID,
      expandedLeafId: null
    }
  }
}

async function bootBridge(storeState: StoreLike): Promise<{
  publish: (mutate: (state: StoreLike) => void) => void
  waitForSnapshot: () => Promise<void>
  dispose: () => void
}> {
  const subscribeListenerRef: { current: StoreSubscribeListener | null } = { current: null }
  vi.doMock('../../store', () => ({
    useAppStore: {
      subscribe: vi.fn((listener: StoreSubscribeListener) => {
        subscribeListenerRef.current = listener
        return () => {
          subscribeListenerRef.current = null
        }
      }),
      getState: () => storeState
    }
  }))
  vi.doMock('../agent-hook-completion-notifications', () => ({
    observeAgentHookCompletionForNotification: vi.fn(),
    syncAgentHookCompletionNotificationsForStoreUpdate: vi.fn()
  }))
  vi.stubGlobal('window', {
    api: {
      agentStatus: {
        onSet: () => () => {},
        getSnapshot: () => Promise.resolve([SNAPSHOT_ENTRY])
      }
    }
  })

  const gate = await import('./agent-status-startup-snapshot-gate')
  const { registerAgentStatusIpcBridge } = await import('./agent-status-ipc-bridge')
  const bridge = registerAgentStatusIpcBridge([])
  return {
    publish: (mutate) => {
      const previousState = { ...storeState }
      mutate(storeState)
      subscribeListenerRef.current?.(storeState, previousState)
    },
    waitForSnapshot: () => gate.waitForAgentStatusStartupSnapshot(),
    dispose: () => {
      bridge.unsubscribeStore()
      bridge.disposeAsyncState()
      gate.resetAgentStatusStartupSnapshotGate()
    }
  }
}

describe('startup snapshot gate waits for a pending replay', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.resetModules()
    vi.doUnmock('../../store')
    vi.doUnmock('../agent-hook-completion-notifications')
  })

  it('keeps the gate closed until the unrouted snapshot entry is applied', async () => {
    vi.resetModules()
    vi.useFakeTimers()
    vi.setSystemTime(1_700_000_100_000)
    const setAgentStatuses = vi.fn(() => [])
    const storeState = buildStoreState({
      setAgentStatuses,
      workspaceSessionReady: true,
      settings: { terminalFontSize: 13, notifications: { enabled: false } }
    })
    installMockAgentStatusTransaction(storeState)

    const harness = await bootBridge(storeState)
    await Promise.resolve()
    await Promise.resolve()

    let released = false
    const waiting = harness.waitForSnapshot().then(() => {
      released = true
    })
    await Promise.resolve()
    expect(released).toBe(false)

    harness.publish(routedTabs)
    await waiting
    expect(released).toBe(true)
    expect(setAgentStatuses).toHaveBeenCalledWith([
      expect.objectContaining({ paneKey: FUTURE_PANE_KEY })
    ])
    harness.dispose()
  })

  it('releases the gate when the snapshot pane is already routable', async () => {
    vi.resetModules()
    vi.useFakeTimers()
    vi.setSystemTime(1_700_000_100_000)
    const storeState = buildStoreState({
      workspaceSessionReady: true,
      settings: { terminalFontSize: 13, notifications: { enabled: false } }
    })
    installMockAgentStatusTransaction(storeState)
    routedTabs(storeState)

    const harness = await bootBridge(storeState)
    await harness.waitForSnapshot()
    harness.dispose()
  })
})
