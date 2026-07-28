import { AGENT_STATUS_STALE_AFTER_MS, type AgentStatusState } from '../../shared/agent-status-types'
import type { AgentSessionSource } from './collector'

/**
 * Minimal status shape from AgentHookServer status-change notifications.
 * paneKey is required so lifetime stats can track per-agent sessions.
 */
export type HookStatusStatsInput = {
  paneKey: string
  state: AgentStatusState
  receivedAt: number
  observedInCurrentRuntime: boolean
}

type StatsAgentLifecycle = {
  onAgentStart: (
    sessionKey: string,
    at: number,
    repoId?: string,
    worktreeId?: string,
    source?: AgentSessionSource
  ) => void
  onAgentStop: (sessionKey: string, at: number, source?: AgentSessionSource) => void
}

export type HookStatusStatsBridgeOptions = {
  /**
   * PTY currently backing a pane, or null when none resolves.
   *
   * Why: the OSC AgentDetector and the hook pipeline watch the same physical
   * agent, and on a hook-enabled machine OSC titles still fire constantly
   * (measured: ~390 agent_start/day, 55%+ of them on panes the hook pipeline
   * also reports). Reusing the PTY-scoped key lets StatsCollector recognize the
   * session as already open instead of counting spawns and worked time twice.
   */
  resolvePtyId?: (paneKey: string) => string | null
}

/**
 * Mirrors AgentDetector's working→idle session boundaries, but driven by the
 * hook status pipeline (Claude/Codex/OpenCode/…) instead of OSC titles.
 *
 * Session keys prefer the pane's live ptyId so both producers converge on one
 * StatsCollector session. The `hook:` fallback only applies to panes with no
 * resolvable PTY, where a collision with the OSC path is impossible anyway.
 *
 * Closing is deliberately driven only by the status stream. PTY teardown clears
 * a pane's row only when a spawn-time paneKey was recorded, so a session on a
 * pane that misses that clear stays open until the row drops or the app quits,
 * where the staleness bound below credits it correctly. Letting the OSC detector
 * close it on PTY exit instead was tried and repeatedly produced worse bugs than
 * the delay it fixed; the real fix is evicting stale rows in AgentHookServer.
 */
export function createHookStatusStatsBridge(
  stats: StatsAgentLifecycle,
  options: HookStatusStatsBridgeOptions = {}
): {
  apply: (statuses: readonly HookStatusStatsInput[], now?: number) => void
  /** Test/inspection helper — paneKeys currently counted as working. */
  getLivePaneKeys: () => string[]
} {
  // paneKey → the session this bridge opened for it. The key is stored rather
  // than re-resolved so a PTY swap mid-turn cannot orphan the open session, and
  // lastEvidenceAt tracks the newest hook event that proved the pane was working.
  const liveWorking = new Map<string, { sessionKey: string; lastEvidenceAt: number }>()

  const closeSession = (paneKey: string, at: number): void => {
    const session = liveWorking.get(paneKey)
    if (session === undefined) {
      return
    }
    liveWorking.delete(paneKey)
    stats.onAgentStop(session.sessionKey, at, 'hook')
  }

  return {
    apply(statuses, now = Date.now()) {
      const present = new Set<string>()

      for (const status of statuses) {
        present.add(status.paneKey)
        // Why: disk-hydrated rows are UI continuity only — counting them would
        // invent agent_start events for sessions that ran in a previous process.
        if (!status.observedInCurrentRuntime) {
          continue
        }

        if (status.state === 'working') {
          const open = liveWorking.get(status.paneKey)
          if (open) {
            // Why rotate on a stale row: a pane whose agent was killed mid-turn
            // keeps its 'working' row forever, so reusing that pane days later
            // would bill the whole dead gap to the turn that follows — and while
            // the abandoned session sits on the pane's ptyId, an OSC-only agent
            // in that pane is counted by nobody (its start hits a live key, its
            // stop hits the wrong owner). Reopening restores both boundaries.
            if (status.receivedAt - open.lastEvidenceAt > AGENT_STATUS_STALE_AFTER_MS) {
              closeSession(status.paneKey, open.lastEvidenceAt)
            } else {
              open.lastEvidenceAt = Math.max(open.lastEvidenceAt, status.receivedAt)
              continue
            }
          }
          // Why the hook: fallback is not just a fallback path: a working event
          // that lands before the runtime has rebuilt this pane's PTY record
          // (daemon reattach right after relaunch) keeps the fallback key for
          // that whole turn, so that one turn can still be counted twice. The
          // window is one turn per pane per restart; re-keying a live session
          // would cost a duplicate spawn, which is worse.
          const sessionKey =
            options.resolvePtyId?.(status.paneKey) ?? toHookStatsSessionKey(status.paneKey)
          liveWorking.set(status.paneKey, { sessionKey, lastEvidenceAt: status.receivedAt })
          stats.onAgentStart(sessionKey, status.receivedAt, undefined, undefined, 'hook')
          continue
        }

        closeSession(status.paneKey, status.receivedAt)
      }

      // Why: a pane move renames the row inside one notification — the new key
      // adopted this same PTY session above, so the vanished old key must not
      // close it or the rest of the turn goes uncounted.
      const adoptedSessionKeys = new Set<string>()
      for (const [paneKey, session] of liveWorking) {
        if (present.has(paneKey)) {
          adoptedSessionKeys.add(session.sessionKey)
        }
      }

      // Why: a cleared pane (tab close / status drop) leaves no snapshot row;
      // close the open working session so totalAgentTimeMs does not leak.
      for (const [paneKey, session] of Array.from(liveWorking)) {
        if (present.has(paneKey)) {
          continue
        }
        liveWorking.delete(paneKey)
        if (adoptedSessionKeys.has(session.sessionKey)) {
          continue
        }
        // Why not always `now`: nothing evicts a stale 'working' row, so an agent
        // that was SIGKILLed (or lost its Stop hook) leaves the pane "working"
        // until the tab closes hours later. Billing that whole gap would dwarf
        // the real totals on the very cards this exists to fix. Past the
        // staleness horizon, credit only up to the last hook event that actually
        // proved work — the OSC path bounds itself the same way with
        // lastMeaningfulOutputAt.
        const stale = now - session.lastEvidenceAt > AGENT_STATUS_STALE_AFTER_MS
        stats.onAgentStop(session.sessionKey, stale ? session.lastEvidenceAt : now, 'hook')
      }
    },
    getLivePaneKeys() {
      return [...liveWorking.keys()]
    }
  }
}

export function toHookStatsSessionKey(paneKey: string): string {
  return `hook:${paneKey}`
}
