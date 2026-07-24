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
    expect(onAgentStart).toHaveBeenCalledWith(toHookStatsSessionKey('tab-a:0'), 100)
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
    expect(onAgentStop).toHaveBeenCalledWith(toHookStatsSessionKey('tab-a:0'), 500)
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

    expect(onAgentStop).toHaveBeenCalledWith(toHookStatsSessionKey('tab-a:0'), 900)
    expect(bridge.getLivePaneKeys()).toEqual([])
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
    expect(onAgentStop).toHaveBeenCalledWith(toHookStatsSessionKey('tab-a:0'), 200)
    expect(bridge.getLivePaneKeys()).toEqual(['tab-b:0'])
  })
})
