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

describe('createHookStatusStatsBridge', () => {
  it('starts a stats session when a pane enters working', () => {
    const onAgentStart = vi.fn()
    const onAgentStop = vi.fn()
    const bridge = createHookStatusStatsBridge({ onAgentStart, onAgentStop })

    bridge.apply([status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 100 })])

    expect(onAgentStart).toHaveBeenCalledTimes(1)
    expect(onAgentStart).toHaveBeenCalledWith(
      toHookStatsSessionKey('tab-a:0'),
      100,
      undefined,
      undefined,
      'hook'
    )
    expect(onAgentStop).not.toHaveBeenCalled()
    expect(bridge.getLivePaneKeys()).toEqual(['tab-a:0'])
  })

  it('does not double-start while the pane stays working', () => {
    const onAgentStart = vi.fn()
    const bridge = createHookStatusStatsBridge({
      onAgentStart,
      onAgentStop: vi.fn()
    })

    bridge.apply([status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 100 })])
    bridge.apply([status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 200 })])

    expect(onAgentStart).toHaveBeenCalledTimes(1)
  })

  it('stops the session when the pane leaves working', () => {
    const onAgentStart = vi.fn()
    const onAgentStop = vi.fn()
    const bridge = createHookStatusStatsBridge({ onAgentStart, onAgentStop })

    bridge.apply([status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 100 })])
    bridge.apply([status({ paneKey: 'tab-a:0', state: 'done', receivedAt: 500 })])

    expect(onAgentStop).toHaveBeenCalledTimes(1)
    expect(onAgentStop).toHaveBeenCalledWith(toHookStatsSessionKey('tab-a:0'), 500, 'hook')
    expect(bridge.getLivePaneKeys()).toEqual([])
  })

  it('ignores disk-hydrated statuses that were not observed in this runtime', () => {
    const onAgentStart = vi.fn()
    const bridge = createHookStatusStatsBridge({
      onAgentStart,
      onAgentStop: vi.fn()
    })

    bridge.apply([
      status({
        paneKey: 'tab-a:0',
        state: 'working',
        receivedAt: 100,
        observedInCurrentRuntime: false
      })
    ])

    expect(onAgentStart).not.toHaveBeenCalled()
    expect(bridge.getLivePaneKeys()).toEqual([])
  })

  it('stops a live session when the pane disappears from the snapshot', () => {
    const onAgentStop = vi.fn()
    const bridge = createHookStatusStatsBridge({
      onAgentStart: vi.fn(),
      onAgentStop
    })

    bridge.apply([status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 100 })])
    bridge.apply([], 900)

    expect(onAgentStop).toHaveBeenCalledWith(toHookStatsSessionKey('tab-a:0'), 900, 'hook')
    expect(bridge.getLivePaneKeys()).toEqual([])
  })

  it('keys the session by the pane ptyId so the OSC detector path is not double-counted', () => {
    const onAgentStart = vi.fn()
    const onAgentStop = vi.fn()
    const bridge = createHookStatusStatsBridge(
      { onAgentStart, onAgentStop },
      { resolvePtyId: (paneKey) => (paneKey === 'tab-a:0' ? 'pty-1' : null) }
    )

    bridge.apply([status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 100 })])
    bridge.apply([status({ paneKey: 'tab-a:0', state: 'done', receivedAt: 500 })])

    expect(onAgentStart).toHaveBeenCalledWith('pty-1', 100, undefined, undefined, 'hook')
    expect(onAgentStop).toHaveBeenCalledWith('pty-1', 500, 'hook')
  })

  it('closes with the session key captured at start when the pane PTY is swapped', () => {
    const onAgentStop = vi.fn()
    let ptyId = 'pty-1'
    const bridge = createHookStatusStatsBridge(
      { onAgentStart: vi.fn(), onAgentStop },
      { resolvePtyId: () => ptyId }
    )

    bridge.apply([status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 100 })])
    ptyId = 'pty-2'
    bridge.apply([status({ paneKey: 'tab-a:0', state: 'done', receivedAt: 500 })])

    expect(onAgentStop).toHaveBeenCalledWith('pty-1', 500, 'hook')
  })

  it('falls back to the hook-prefixed key when no PTY backs the pane', () => {
    const onAgentStart = vi.fn()
    const bridge = createHookStatusStatsBridge(
      { onAgentStart, onAgentStop: vi.fn() },
      { resolvePtyId: () => null }
    )

    bridge.apply([status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 100 })])

    expect(onAgentStart).toHaveBeenCalledWith(
      toHookStatsSessionKey('tab-a:0'),
      100,
      undefined,
      undefined,
      'hook'
    )
  })

  it('credits only up to the last hook evidence when a stale working row is swept', () => {
    const onAgentStop = vi.fn()
    const bridge = createHookStatusStatsBridge({ onAgentStart: vi.fn(), onAgentStop })

    // Agent is killed mid-turn, so no further hook event ever lands; the pane
    // row stays 'working' until the user closes the tab six hours later.
    bridge.apply([status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 1_000 })])
    bridge.apply([], 1_000 + 6 * 60 * 60 * 1_000)

    expect(onAgentStop).toHaveBeenCalledWith(toHookStatsSessionKey('tab-a:0'), 1_000, 'hook')
  })

  it('uses the teardown time when the swept row is still fresh', () => {
    const onAgentStop = vi.fn()
    const bridge = createHookStatusStatsBridge({ onAgentStart: vi.fn(), onAgentStop })

    bridge.apply([status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 1_000 })])
    bridge.apply([status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 60_000 })])
    bridge.apply([], 90_000)

    expect(onAgentStop).toHaveBeenCalledWith(toHookStatsSessionKey('tab-a:0'), 90_000, 'hook')
  })

  it('rotates a stale working session when the pane is reused', () => {
    const onAgentStart = vi.fn()
    const onAgentStop = vi.fn()
    const bridge = createHookStatusStatsBridge({ onAgentStart, onAgentStop })
    const nextDay = 1_000 + 24 * 60 * 60 * 1_000

    // Agent killed mid-turn — the row never leaves 'working'. Reusing the pane
    // the next day must not bill the dead gap to the new turn.
    bridge.apply([status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 1_000 })])
    bridge.apply([status({ paneKey: 'tab-a:0', state: 'working', receivedAt: nextDay })])
    bridge.apply([status({ paneKey: 'tab-a:0', state: 'done', receivedAt: nextDay + 5_000 })])

    expect(onAgentStop).toHaveBeenNthCalledWith(1, toHookStatsSessionKey('tab-a:0'), 1_000, 'hook')
    expect(onAgentStart).toHaveBeenCalledTimes(2)
    expect(onAgentStop).toHaveBeenNthCalledWith(
      2,
      toHookStatsSessionKey('tab-a:0'),
      nextDay + 5_000,
      'hook'
    )
  })

  it('does not close a session the moved pane key just adopted', () => {
    const onAgentStart = vi.fn()
    const onAgentStop = vi.fn()
    const bridge = createHookStatusStatsBridge(
      { onAgentStart, onAgentStop },
      { resolvePtyId: () => 'pty-1' }
    )

    bridge.apply([status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 100 })])
    // transferPaneAuthority renames the row inside one notification.
    bridge.apply([status({ paneKey: 'tab-b:0', state: 'working', receivedAt: 200 })])

    expect(onAgentStop).not.toHaveBeenCalled()
    expect(bridge.getLivePaneKeys()).toEqual(['tab-b:0'])

    bridge.apply([status({ paneKey: 'tab-b:0', state: 'done', receivedAt: 500 })])
    expect(onAgentStop).toHaveBeenCalledTimes(1)
    expect(onAgentStop).toHaveBeenCalledWith('pty-1', 500, 'hook')
  })

  it('tracks multiple panes independently', () => {
    const onAgentStart = vi.fn()
    const onAgentStop = vi.fn()
    const bridge = createHookStatusStatsBridge({ onAgentStart, onAgentStop })

    bridge.apply([
      status({ paneKey: 'tab-a:0', state: 'working', receivedAt: 100 }),
      status({ paneKey: 'tab-b:0', state: 'working', receivedAt: 110 })
    ])
    bridge.apply([
      status({ paneKey: 'tab-a:0', state: 'done', receivedAt: 200 }),
      status({ paneKey: 'tab-b:0', state: 'working', receivedAt: 210 })
    ])

    expect(onAgentStart).toHaveBeenCalledTimes(2)
    expect(onAgentStop).toHaveBeenCalledTimes(1)
    expect(onAgentStop).toHaveBeenCalledWith(toHookStatsSessionKey('tab-a:0'), 200, 'hook')
    expect(bridge.getLivePaneKeys()).toEqual(['tab-b:0'])
  })
})
