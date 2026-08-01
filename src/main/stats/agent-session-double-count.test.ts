import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Why: OSC title detection and the hook status pipeline both observe the same
// physical agent, and on a hook-enabled machine OSC still fires constantly
// (measured on a maintainer install: ~390 agent_start/day, 55%+ of them on
// panes the hook pipeline also reports). Without a shared session key the
// "Agents spawned" and "Time agents worked" cards roughly double. These tests
// drive the real AgentDetector and the real bridge into one real StatsCollector,
// so they fail if either producer stops sharing the pane's PTY-scoped key.

let userDataDir: string

vi.mock('electron', () => ({
  app: { getPath: () => userDataDir }
}))

const PTY_ID = 'repo-1::/tmp/wt@@abc123'
const PANE_KEY = 'tab-1:6c1a5f7e-6a3c-4a55-8a4d-9d0d3b0e6f11'

/** OSC 0 title sequence followed by ordinary output, the shape a real agent emits. */
function agentChunk(title: string): string {
  return `\x1b]0;${title}\x07wrote src/app.ts\r\n`
}

/** Title update with no printable output, which leaves lastMeaningfulOutputAt null. */
function titleOnlyChunk(title: string): string {
  return `\x1b]0;${title}\x07`
}

async function loadStats() {
  const [{ StatsCollector, initStatsPath }, { AgentDetector }, bridgeModule] = await Promise.all([
    import('./collector'),
    import('./agent-detector'),
    import('./hook-status-stats-bridge')
  ])
  initStatsPath()
  const stats = new StatsCollector()
  const detector = new AgentDetector(stats)
  const bridge = bridgeModule.createHookStatusStatsBridge(stats, {
    resolvePtyId: (paneKey) => (paneKey === PANE_KEY ? PTY_ID : null)
  })
  const createBridge = (resolvePtyId: (paneKey: string) => string | null) =>
    bridgeModule.createHookStatusStatsBridge(stats, { resolvePtyId })
  return { stats, detector, bridge, createBridge }
}

function hookStatus(state: 'working' | 'done', receivedAt: number) {
  return [{ paneKey: PANE_KEY, state, receivedAt, observedInCurrentRuntime: true }]
}

describe('agent session counting across the OSC and hook producers', () => {
  beforeEach(() => {
    userDataDir = mkdtempSync(join(tmpdir(), 'orca-stats-dedupe-'))
    vi.resetModules()
  })

  afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true })
  })

  it('counts one session when hooks open the turn and OSC titles echo it', async () => {
    const { stats, detector, bridge } = await loadStats()

    bridge.apply(hookStatus('working', 1_000))
    detector.onData(PTY_ID, agentChunk('claude working'), 1_100)
    detector.onData(PTY_ID, agentChunk('claude ready'), 5_000)
    bridge.apply(hookStatus('done', 5_100))

    expect(stats.getSummary().totalAgentsSpawned).toBe(1)
  })

  it('counts one session when OSC titles open the turn and hooks echo it', async () => {
    const { stats, detector, bridge } = await loadStats()

    detector.onData(PTY_ID, agentChunk('claude working'), 1_000)
    bridge.apply(hookStatus('working', 1_100))
    bridge.apply(hookStatus('done', 5_000))
    detector.onData(PTY_ID, agentChunk('claude ready'), 5_100)

    expect(stats.getSummary().totalAgentsSpawned).toBe(1)
  })

  it('adds worked time once, on the hook boundary, not once per producer', async () => {
    const { stats, detector, bridge } = await loadStats()

    bridge.apply(hookStatus('working', 1_000))
    detector.onData(PTY_ID, agentChunk('claude working'), 1_000)
    detector.onData(PTY_ID, agentChunk('claude ready'), 4_000)
    bridge.apply(hookStatus('done', 4_100))

    // The hook stream owns the session, so the turn ends at its 4100 'done',
    // not at the detector's 4000 last-meaningful-output stop.
    expect(stats.getSummary().totalAgentTimeMs).toBe(3_100)
  })

  it('still counts consecutive turns on the same pane', async () => {
    const { stats, bridge } = await loadStats()

    bridge.apply(hookStatus('working', 1_000))
    bridge.apply(hookStatus('done', 2_000))
    bridge.apply(hookStatus('working', 3_000))
    bridge.apply(hookStatus('done', 4_000))

    expect(stats.getSummary().totalAgentsSpawned).toBe(2)
    expect(stats.getSummary().totalAgentTimeMs).toBe(2_000)
  })

  it('lets the hook stream keep the turn boundary when OSC emits titles only', async () => {
    const { stats, detector, bridge } = await loadStats()

    // No printable output, so the detector's stop time collapses to its own
    // session start. If it were allowed to close the hook-owned session, the
    // turn would be recorded as ~0ms — the near-zero numbers issue #10201 is about.
    bridge.apply(hookStatus('working', 1_000))
    detector.onData(PTY_ID, titleOnlyChunk('claude working'), 1_100)
    detector.onData(PTY_ID, titleOnlyChunk('claude ready'), 5_000)
    bridge.apply(hookStatus('done', 5_100))

    expect(stats.getSummary().totalAgentsSpawned).toBe(1)
    expect(stats.getSummary().totalAgentTimeMs).toBe(4_100)
  })

  it('hands the boundary to hooks even when OSC opened the turn first', async () => {
    const { stats, detector, bridge } = await loadStats()

    detector.onData(PTY_ID, titleOnlyChunk('claude working'), 1_000)
    bridge.apply(hookStatus('working', 1_100))
    detector.onData(PTY_ID, titleOnlyChunk('claude ready'), 5_000)
    bridge.apply(hookStatus('done', 6_000))

    expect(stats.getSummary().totalAgentsSpawned).toBe(1)
    expect(stats.getSummary().totalAgentTimeMs).toBe(5_000)
  })

  it('still counts a pane the hook pipeline never reports', async () => {
    const { stats, detector } = await loadStats()

    detector.onData('other-pty', agentChunk('claude working'), 1_000)
    detector.onData('other-pty', agentChunk('claude ready'), 4_000)

    expect(stats.getSummary().totalAgentsSpawned).toBe(1)
    expect(stats.getSummary().totalAgentTimeMs).toBe(3_000)
  })

  it('counts a hook-only pane with no resolvable PTY', async () => {
    const { stats, bridge } = await loadStats()

    bridge.apply([
      { paneKey: 'tab-9:0', state: 'working', receivedAt: 1_000, observedInCurrentRuntime: true }
    ])
    bridge.apply([
      { paneKey: 'tab-9:0', state: 'done', receivedAt: 3_000, observedInCurrentRuntime: true }
    ])

    expect(stats.getSummary().totalAgentsSpawned).toBe(1)
    expect(stats.getSummary().totalAgentTimeMs).toBe(2_000)
  })

  it('an OSC title cycle mid-turn never splits a live hook session', async () => {
    const { stats, detector, bridge } = await loadStats()
    const { AGENT_STATUS_STALE_AFTER_MS } = await import('../../shared/agent-status-types')

    // A long tool call hides the spinner: the OSC title goes idle and comes
    // back mid-turn while the hook row stays 'working' with no new events.
    bridge.apply(hookStatus('working', 1_000))
    detector.onData(PTY_ID, agentChunk('claude working'), 2_000)
    detector.onData(PTY_ID, agentChunk('claude ready'), 10_000)
    const spinnerBack = 1_000 + AGENT_STATUS_STALE_AFTER_MS + 60_000
    detector.onData(PTY_ID, agentChunk('claude working'), spinnerBack)
    const doneAt = spinnerBack + 60_000
    bridge.apply(hookStatus('done', doneAt))

    // Hook-event silence is not death: one turn, hook-owned boundary, full span.
    expect(stats.getSummary().totalAgentsSpawned).toBe(1)
    expect(stats.getSummary().totalAgentTimeMs).toBe(doneAt - 1_000)
  })

  it('the quit sweep keeps wall clock off a dead agent, and flush stays a no-op after it', async () => {
    const { stats, bridge } = await loadStats()
    const { AGENT_STATUS_STALE_AFTER_MS } = await import('../../shared/agent-status-types')

    // Agent SIGKILLed right after its only hook event; user quits hours later.
    bridge.apply(hookStatus('working', 1_000))
    bridge.apply([], 1_000 + 4 * AGENT_STATUS_STALE_AFTER_MS)
    stats.flush()

    expect(stats.getSummary().totalAgentsSpawned).toBe(1)
    expect(stats.getSummary().totalAgentTimeMs).toBe(0)
  })

  it('a late hook event adopts an open OSC session and inherits its span', async () => {
    const { stats, detector, bridge } = await loadStats()
    const { AGENT_STATUS_STALE_AFTER_MS } = await import('../../shared/agent-status-types')

    // Hooks can attach long after OSC opened the session. Adoption inherits
    // the span — evidence cadence is not liveness, so rotating here would
    // split genuinely live sessions (measured before this rule was settled).
    detector.onData(PTY_ID, agentChunk('claude working'), 1_000)
    const hookAt = 1_000 + AGENT_STATUS_STALE_AFTER_MS + 60_000
    bridge.apply(hookStatus('working', hookAt))
    bridge.apply(hookStatus('done', hookAt + 5_000))

    expect(stats.getSummary().totalAgentsSpawned).toBe(1)
    expect(stats.getSummary().totalAgentTimeMs).toBe(hookAt + 5_000 - 1_000)
  })

  it('a tool call outlasting the horizon splits the turn — accepted granularity residual', async () => {
    const { stats, bridge } = await loadStats()
    const { AGENT_STATUS_STALE_AFTER_MS } = await import('../../shared/agent-status-types')

    // Hooks carry no heartbeat, so a single tool call longer than the horizon
    // is indistinguishable from a killed agent. The rotation splits the turn
    // and credits only hook-proven spans; every liveness signal tried against
    // this (terminal output, working titles) made a worse case unbounded. See
    // the residuals note in hook-status-stats-bridge.ts.
    bridge.apply(hookStatus('working', 1_000))
    const postToolUse = 1_000 + AGENT_STATUS_STALE_AFTER_MS + 60_000
    bridge.apply(hookStatus('working', postToolUse))
    bridge.apply(hookStatus('done', postToolUse + 5_000))

    expect(stats.getSummary().totalAgentsSpawned).toBe(2)
    expect(stats.getSummary().totalAgentTimeMs).toBe(5_000)
  })

  it('user shell output never keeps a dead row alive', async () => {
    const { stats, detector, bridge } = await loadStats()
    const { AGENT_STATUS_STALE_AFTER_MS } = await import('../../shared/agent-status-types')

    // Agent killed after its only hook event; the user keeps using the pane's
    // shell all day. Output alone is not liveness — only an agent-painted
    // working title is — so the next turn must rotate, not inherit the gap.
    bridge.apply(hookStatus('working', 1_000))
    const nextDay = 1_000 + 24 * 60 * 60 * 1_000
    for (let at = 60_000; at < nextDay; at += AGENT_STATUS_STALE_AFTER_MS / 2) {
      detector.onData(PTY_ID, 'ls -la\r\ntotal 128\r\n', at)
    }

    bridge.apply(hookStatus('working', nextDay))
    bridge.apply(hookStatus('done', nextDay + 5_000))

    expect(stats.getSummary().totalAgentsSpawned).toBe(2)
    expect(stats.getSummary().totalAgentTimeMs).toBe(5_000)
  })

  it('a repeated OSC start never claims hook ownership', async () => {
    const { stats } = await loadStats()

    stats.onAgentStart(PTY_ID, 1_000)
    // Title cycles re-fire starts; the OSC producer must keep owning its own
    // session or its stop below would be refused and the session never close.
    stats.onAgentStart(PTY_ID, 2_000)
    stats.onAgentStop(PTY_ID, 3_000)

    expect(stats.getSummary().totalAgentsSpawned).toBe(1)
    expect(stats.getSummary().totalAgentTimeMs).toBe(2_000)
  })

  it('hasLiveAgent mirrors open sessions', async () => {
    const { stats } = await loadStats()

    expect(stats.hasLiveAgent(PTY_ID)).toBe(false)
    stats.onAgentStart(PTY_ID, 1_000, undefined, undefined, 'hook')
    expect(stats.hasLiveAgent(PTY_ID)).toBe(true)
    stats.onAgentStop(PTY_ID, 2_000, 'hook')
    expect(stats.hasLiveAgent(PTY_ID)).toBe(false)
  })

  it('does not mint phantom spawns from a frozen sibling row', async () => {
    const { stats, createBridge } = await loadStats()
    const bridge = createBridge(() => PTY_ID)
    const row = (paneKey: string, state: 'working' | 'done', receivedAt: number) => ({
      paneKey,
      state,
      receivedAt,
      observedInCurrentRuntime: true
    })

    // B's agent dies right after its only event; A closes the shared session.
    bridge.apply([row('tab-a:0', 'working', 1_000), row('tab-b:0', 'working', 1_000)])
    bridge.apply([row('tab-a:0', 'done', 5_000), row('tab-b:0', 'working', 1_000)])
    // B's frozen row is redelivered on every later notification.
    bridge.apply([row('tab-a:0', 'done', 5_000), row('tab-b:0', 'working', 1_000)])
    bridge.apply([row('tab-a:0', 'done', 5_000), row('tab-b:0', 'working', 1_000)])

    expect(stats.getSummary().totalAgentsSpawned).toBe(1)
    expect(stats.getSummary().totalAgentTimeMs).toBe(4_000)
  })

  it('reopens a shared-key session when the survivor proves it is still working', async () => {
    const { stats, createBridge } = await loadStats()
    // One PTY surfaced by two rows. Production advances one row per
    // notification: only the pane that fired carries a fresh receivedAt.
    const bridge = createBridge(() => PTY_ID)
    const row = (paneKey: string, state: 'working' | 'done', receivedAt: number) => ({
      paneKey,
      state,
      receivedAt,
      observedInCurrentRuntime: true
    })

    bridge.apply([row('tab-a:0', 'working', 1_000), row('tab-b:0', 'working', 1_000)])
    bridge.apply([row('tab-a:0', 'done', 5_000), row('tab-b:0', 'working', 1_000)])
    bridge.apply([row('tab-a:0', 'done', 5_000), row('tab-b:0', 'working', 6_000)])
    bridge.apply([row('tab-b:0', 'done', 9_000)])

    // A's span (4000) plus B's tail from its reopen (3000). The 5000→6000 gap
    // is the documented quiet-row residual.
    expect(stats.getSummary().totalAgentsSpawned).toBe(2)
    expect(stats.getSummary().totalAgentTimeMs).toBe(7_000)
  })

  it('flush closes hook-owned sessions with their own source', async () => {
    const { stats, bridge } = await loadStats()

    const startedAt = Date.now() - 5_000
    bridge.apply(hookStatus('working', startedAt))
    stats.flush()

    // A flush that replayed the wrong source would leave the hook session open
    // and credit nothing.
    expect(stats.getSummary().totalAgentsSpawned).toBe(1)
    expect(stats.getSummary().totalAgentTimeMs).toBeGreaterThanOrEqual(5_000)
    expect(stats.getSummary().totalAgentTimeMs).toBeLessThan(60_000)
  })
})
