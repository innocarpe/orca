import { describe, expect, it, vi } from 'vitest'
import {
  createHookStatusStatsBridge,
  toHookStatsSessionKey,
  type HookStatusStatsInput
} from './hook-status-stats-bridge'

function status(
  overrides: Partial<HookStatusStatsInput> & Pick<HookStatusStatsInput, 'paneKey' | 'state'>
): HookStatusStatsInput {
  return {
    receivedAt: 1_000,
    observedInCurrentRuntime: true,
    ...overrides
  }
}

// Mirrors StatsCollector's dedupe: hasLiveAgent reflects start/stop pairs so the
// bridge's reopen guard sees the same live-session view production would.
function fakeStats() {
  const live = new Set<string>()
  return {
    onAgentStart: vi.fn(
      (
        sessionKey: string,
        _at?: number,
        _repoId?: string,
        _worktreeId?: string,
        _source?: 'osc' | 'hook'
      ) => {
        live.add(sessionKey)
      }
    ),
    onAgentStop: vi.fn((sessionKey: string, _at?: number, _source?: 'osc' | 'hook') => {
      live.delete(sessionKey)
    }),
    hasLiveAgent: (sessionKey: string) => live.has(sessionKey)
  }
}

describe('createHookStatusStatsBridge', () => {
  it('starts a stats session when a pane enters working', () => {
    const stats = fakeStats()
    const bridge = createHookStatusStatsBridge(stats)

    bridge.apply([status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 100 })])

    expect(stats.onAgentStart).toHaveBeenCalledTimes(1)
    expect(stats.onAgentStart).toHaveBeenCalledWith(
      toHookStatsSessionKey('tab-a:0'),
      100,
      undefined,
      undefined,
      'hook'
    )
    expect(stats.onAgentStop).not.toHaveBeenCalled()
    expect(bridge.getLivePaneKeys()).toEqual(['tab-a:0'])
  })

  it('does not double-start while the pane stays working', () => {
    const stats = fakeStats()
    const bridge = createHookStatusStatsBridge(stats)

    bridge.apply([status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 100 })])
    bridge.apply([status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 200 })])

    expect(stats.onAgentStart).toHaveBeenCalledTimes(1)
  })

  it('stops the session when the pane leaves working', () => {
    const stats = fakeStats()
    const bridge = createHookStatusStatsBridge(stats)

    bridge.apply([status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 100 })])
    bridge.apply([status({ paneKey: 'tab-a:0', state: 'done', receivedAt: 500 })])

    expect(stats.onAgentStop).toHaveBeenCalledTimes(1)
    expect(stats.onAgentStop).toHaveBeenCalledWith(toHookStatsSessionKey('tab-a:0'), 500, 'hook')
    expect(bridge.getLivePaneKeys()).toEqual([])
  })

  it('ignores disk-hydrated statuses that were not observed in this runtime', () => {
    const stats = fakeStats()
    const bridge = createHookStatusStatsBridge(stats)

    bridge.apply([
      status({
        paneKey: 'tab-a:0',
        state: 'working',
        receivedAt: 100,
        observedInCurrentRuntime: false
      })
    ])

    expect(stats.onAgentStart).not.toHaveBeenCalled()
    expect(bridge.getLivePaneKeys()).toEqual([])
  })

  it('stops a live session when the pane disappears from the snapshot', () => {
    const stats = fakeStats()
    const bridge = createHookStatusStatsBridge(stats)

    bridge.apply([status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 100 })])
    bridge.apply([], 900)

    expect(stats.onAgentStop).toHaveBeenCalledWith(toHookStatsSessionKey('tab-a:0'), 900, 'hook')
    expect(bridge.getLivePaneKeys()).toEqual([])
  })

  it('keys the session by the pane ptyId so the OSC detector path is not double-counted', () => {
    const stats = fakeStats()
    const bridge = createHookStatusStatsBridge(stats, {
      resolvePtyId: (paneKey) => (paneKey === 'tab-a:0' ? 'pty-1' : null)
    })

    bridge.apply([status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 100 })])
    bridge.apply([status({ paneKey: 'tab-a:0', state: 'done', receivedAt: 500 })])

    expect(stats.onAgentStart).toHaveBeenCalledWith('pty-1', 100, undefined, undefined, 'hook')
    expect(stats.onAgentStop).toHaveBeenCalledWith('pty-1', 500, 'hook')
  })

  it('closes with the session key captured at start when the pane PTY is swapped', () => {
    const stats = fakeStats()
    let ptyId = 'pty-1'
    const bridge = createHookStatusStatsBridge(stats, { resolvePtyId: () => ptyId })

    bridge.apply([status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 100 })])
    ptyId = 'pty-2'
    bridge.apply([status({ paneKey: 'tab-a:0', state: 'done', receivedAt: 500 })])

    expect(stats.onAgentStop).toHaveBeenCalledWith('pty-1', 500, 'hook')
  })

  it('falls back to the hook-prefixed key when no PTY backs the pane', () => {
    const stats = fakeStats()
    const bridge = createHookStatusStatsBridge(stats, { resolvePtyId: () => null })

    bridge.apply([status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 100 })])

    expect(stats.onAgentStart).toHaveBeenCalledWith(
      toHookStatsSessionKey('tab-a:0'),
      100,
      undefined,
      undefined,
      'hook'
    )
  })

  it('credits only up to the last hook evidence when a stale working row is swept', () => {
    const stats = fakeStats()
    const bridge = createHookStatusStatsBridge(stats)

    // Agent is killed mid-turn, so no further hook event ever lands; the pane
    // row stays 'working' until the user closes the tab six hours later.
    bridge.apply([status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 1_000 })])
    bridge.apply([], 1_000 + 6 * 60 * 60 * 1_000)

    expect(stats.onAgentStop).toHaveBeenCalledWith(toHookStatsSessionKey('tab-a:0'), 1_000, 'hook')
  })

  it('uses the teardown time when the swept row is still fresh', () => {
    const stats = fakeStats()
    const bridge = createHookStatusStatsBridge(stats)

    bridge.apply([status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 1_000 })])
    bridge.apply([status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 60_000 })])
    bridge.apply([], 90_000)

    expect(stats.onAgentStop).toHaveBeenCalledWith(toHookStatsSessionKey('tab-a:0'), 90_000, 'hook')
  })

  it('hook events inside the horizon keep a long turn as one session', () => {
    const stats = fakeStats()
    const bridge = createHookStatusStatsBridge(stats)
    const twentyMin = 20 * 60 * 1_000

    // A 60-minute turn whose hook events never gap past the horizon: each
    // working event advances the row's evidence, so the rotation must not
    // split it — the residual is bounded to genuine >horizon silent gaps.
    bridge.apply([status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 1_000 })])
    bridge.apply([status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 1_000 + twentyMin })])
    bridge.apply([
      status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 1_000 + 2 * twentyMin })
    ])
    bridge.apply([status({ paneKey: 'tab-a:0', state: 'done', receivedAt: 1_000 + 3 * twentyMin })])

    expect(stats.onAgentStart).toHaveBeenCalledTimes(1)
    expect(stats.onAgentStop).toHaveBeenCalledTimes(1)
    expect(stats.onAgentStop).toHaveBeenCalledWith(
      toHookStatsSessionKey('tab-a:0'),
      1_000 + 3 * twentyMin,
      'hook'
    )
  })

  it('rotates a stale working session when the pane is reused', () => {
    const stats = fakeStats()
    const bridge = createHookStatusStatsBridge(stats)
    const nextDay = 1_000 + 24 * 60 * 60 * 1_000

    // Agent killed mid-turn — the row never leaves 'working'. Reusing the pane
    // the next day must not bill the dead gap to the new turn.
    bridge.apply([status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 1_000 })])
    bridge.apply([status({ paneKey: 'tab-a:0', state: 'working', receivedAt: nextDay })])
    bridge.apply([status({ paneKey: 'tab-a:0', state: 'done', receivedAt: nextDay + 5_000 })])

    expect(stats.onAgentStop).toHaveBeenNthCalledWith(
      1,
      toHookStatsSessionKey('tab-a:0'),
      1_000,
      'hook'
    )
    expect(stats.onAgentStart).toHaveBeenCalledTimes(2)
    expect(stats.onAgentStop).toHaveBeenNthCalledWith(
      2,
      toHookStatsSessionKey('tab-a:0'),
      nextDay + 5_000,
      'hook'
    )
  })
  it('rotates stale rows sharing a session key only once per snapshot', () => {
    const stats = fakeStats()
    const bridge = createHookStatusStatsBridge(stats, { resolvePtyId: () => 'pty-1' })
    const nextDay = 1_000 + 24 * 60 * 60 * 1_000

    bridge.apply([
      status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 1_000 }),
      status({ paneKey: 'tab-b:0', state: 'working', receivedAt: 1_000 })
    ])
    bridge.apply([
      status({ paneKey: 'tab-a:0', state: 'working', receivedAt: nextDay }),
      status({ paneKey: 'tab-b:0', state: 'working', receivedAt: nextDay })
    ])

    expect(stats.onAgentStop).toHaveBeenCalledTimes(1)
    expect(stats.onAgentStop).toHaveBeenCalledWith('pty-1', 1_000, 'hook')
    // Both initial rows reach the collector; its shared-key dedupe makes the second a no-op.
    expect(stats.onAgentStart).toHaveBeenCalledTimes(3)
    expect(stats.onAgentStart).toHaveBeenLastCalledWith(
      'pty-1',
      nextDay,
      undefined,
      undefined,
      'hook'
    )
    expect(stats.hasLiveAgent('pty-1')).toBe(true)
  })

  it('reopens the shared session when a sibling row on the same PTY closed it', () => {
    const stats = fakeStats()
    // One PTY surfaced by two rows. Production advances one row's receivedAt
    // per notification — only the pane that fired carries a fresh stamp.
    const bridge = createHookStatusStatsBridge(stats, { resolvePtyId: () => 'pty-1' })

    bridge.apply([
      status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 1_000 }),
      status({ paneKey: 'tab-b:0', state: 'working', receivedAt: 1_000 })
    ])
    // Pane A goes idle and closes the shared collector session; B's row is
    // unchanged in that snapshot, so nothing reopens yet.
    bridge.apply([
      status({ paneKey: 'tab-a:0', state: 'done', receivedAt: 5_000 }),
      status({ paneKey: 'tab-b:0', state: 'working', receivedAt: 1_000 })
    ])
    expect(stats.onAgentStop).toHaveBeenCalledWith('pty-1', 5_000, 'hook')
    expect(stats.hasLiveAgent('pty-1')).toBe(false)

    // B's next real event proves it still works: reopen.
    bridge.apply([
      status({ paneKey: 'tab-a:0', state: 'done', receivedAt: 5_000 }),
      status({ paneKey: 'tab-b:0', state: 'working', receivedAt: 6_000 })
    ])
    expect(stats.onAgentStart).toHaveBeenLastCalledWith(
      'pty-1',
      6_000,
      undefined,
      undefined,
      'hook'
    )
    expect(stats.hasLiveAgent('pty-1')).toBe(true)

    bridge.apply([status({ paneKey: 'tab-b:0', state: 'done', receivedAt: 9_000 })])
    expect(stats.onAgentStop).toHaveBeenLastCalledWith('pty-1', 9_000, 'hook')
  })

  it('keeps the newest close when an older close stamps the same survivors', () => {
    const stats = fakeStats()
    const bridge = createHookStatusStatsBridge(stats, { resolvePtyId: () => 'pty-1' })
    const row = (paneKey: string, state: 'working' | 'done', receivedAt: number) =>
      status({ paneKey, state, receivedAt })

    bridge.apply([
      row('tab-a:0', 'working', 1_000),
      row('tab-b:0', 'working', 1_000),
      row('tab-c:0', 'working', 1_000)
    ])
    // A closes at 5000, stamping B and C; B then closes at an OLDER stamp —
    // C's clamp must keep the newest close, not regress.
    bridge.apply([
      row('tab-a:0', 'done', 5_000),
      row('tab-b:0', 'working', 1_000),
      row('tab-c:0', 'working', 1_000)
    ])
    bridge.apply([row('tab-b:0', 'done', 2_000), row('tab-c:0', 'working', 1_000)])
    bridge.apply([row('tab-c:0', 'working', 3_000)])

    expect(stats.onAgentStart).toHaveBeenLastCalledWith(
      'pty-1',
      5_000,
      undefined,
      undefined,
      'hook'
    )
  })

  it('reopens no earlier than the key’s last close', () => {
    const stats = fakeStats()
    const bridge = createHookStatusStatsBridge(stats, { resolvePtyId: () => 'pty-1' })

    bridge.apply([
      status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 1_000 }),
      status({ paneKey: 'tab-b:0', state: 'working', receivedAt: 1_000 })
    ])
    // B's newest event predates A's close. Reopening at B's own stamp would
    // bill the 3000→5000 overlap twice — clamp to the close.
    bridge.apply([
      status({ paneKey: 'tab-a:0', state: 'done', receivedAt: 5_000 }),
      status({ paneKey: 'tab-b:0', state: 'working', receivedAt: 3_000 })
    ])

    expect(stats.onAgentStart).toHaveBeenLastCalledWith(
      'pty-1',
      5_000,
      undefined,
      undefined,
      'hook'
    )
  })

  it('does not reopen while the collector still holds the session', () => {
    const stats = fakeStats()
    const bridge = createHookStatusStatsBridge(stats, { resolvePtyId: () => 'pty-1' })

    bridge.apply([status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 100 })])
    bridge.apply([status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 200 })])
    bridge.apply([status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 300 })])

    expect(stats.onAgentStart).toHaveBeenCalledTimes(1)
  })

  it('does not reopen from a frozen row that carries no new evidence', () => {
    const stats = fakeStats()
    const bridge = createHookStatusStatsBridge(stats, { resolvePtyId: () => 'pty-1' })

    // Agent dies mid-turn: its row is redelivered unchanged in every later
    // snapshot. After the collector's key is freed (sibling close), a redelivery
    // must not mint a phantom spawn.
    bridge.apply([status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 1_000 })])
    stats.onAgentStop('pty-1', 5_000, 'hook')
    bridge.apply([status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 1_000 })])
    expect(stats.onAgentStart).toHaveBeenCalledTimes(1)

    // A genuinely new hook event (the agent is alive again) does reopen.
    bridge.apply([status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 2_000 })])
    expect(stats.onAgentStart).toHaveBeenCalledTimes(2)
    expect(stats.onAgentStart).toHaveBeenLastCalledWith(
      'pty-1',
      2_000,
      undefined,
      undefined,
      'hook'
    )
  })

  it('does not close a session the moved pane key just adopted', () => {
    const stats = fakeStats()
    const bridge = createHookStatusStatsBridge(stats, { resolvePtyId: () => 'pty-1' })

    bridge.apply([status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 100 })])
    // transferPaneAuthority renames the row inside one notification.
    bridge.apply([status({ paneKey: 'tab-b:0', state: 'working', receivedAt: 200 })])

    expect(stats.onAgentStop).not.toHaveBeenCalled()
    expect(bridge.getLivePaneKeys()).toEqual(['tab-b:0'])

    bridge.apply([status({ paneKey: 'tab-b:0', state: 'done', receivedAt: 500 })])
    expect(stats.onAgentStop).toHaveBeenCalledTimes(1)
    expect(stats.onAgentStop).toHaveBeenCalledWith('pty-1', 500, 'hook')
  })

  it('tracks multiple panes independently', () => {
    const stats = fakeStats()
    const bridge = createHookStatusStatsBridge(stats)

    bridge.apply([
      status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 100 }),
      status({ paneKey: 'tab-b:0', state: 'working', receivedAt: 110 })
    ])
    bridge.apply([
      status({ paneKey: 'tab-a:0', state: 'done', receivedAt: 200 }),
      status({ paneKey: 'tab-b:0', state: 'working', receivedAt: 210 })
    ])

    expect(stats.onAgentStart).toHaveBeenCalledTimes(2)
    expect(stats.onAgentStop).toHaveBeenCalledTimes(1)
    expect(stats.onAgentStop).toHaveBeenCalledWith(toHookStatsSessionKey('tab-a:0'), 200, 'hook')
    expect(bridge.getLivePaneKeys()).toEqual(['tab-b:0'])
  })
})
