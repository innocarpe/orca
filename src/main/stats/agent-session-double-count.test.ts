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
  return { stats, detector, bridge }
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
})
