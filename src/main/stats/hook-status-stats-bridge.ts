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
  hasLiveAgent: (sessionKey: string) => boolean
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
 *
 * Accepted residuals, all rooted in rows nothing evicts and in hook events
 * carrying no liveness heartbeat. Cross-producer evidence (terminal output,
 * then working titles) was tried against each and made another case worse —
 * output let a user's shell keep a dead session alive forever, and agents do
 * not repaint working titles inside a turn (Claude writes its title once per
 * session, measured). The real fix for all of them is upstream stale-row
 * eviction in AgentHookServer:
 * - A turn whose tool call outlasts the staleness horizon with no hook event
 *   in between splits into two counted sessions at the next working event,
 *   crediting only the spans the hook stream proved. On such turns this
 *   credits LESS than the OSC path alone would (its output-bounded close
 *   spans the whole turn) — for hook-enabled panes that is a real regression
 *   scoped to >30-min hook-silent tool calls, accepted over the unbounded
 *   dead-row billing every rejected alternative reintroduced.
 * - Two rows sharing one session key can diverge; a row whose events went
 *   quiet before its sibling closed the session loses its tail time until its
 *   next working event — and loses the remainder of the turn when that next
 *   event is its own done. The reopen below refuses frozen rows because
 *   honoring them would mint unbounded phantom spawns from dead panes.
 * - A hook agent killed without a Stop parks its session on the pane's key
 *   until its next hook turn rotates it, and OSC-only agents in that pane go
 *   uncounted while it is parked.
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
  // keyClosedAt is stamped on surviving rows when a sibling closes their shared
  // key, so a reopen can never back-date into the span already credited.
  const liveWorking = new Map<
    string,
    { sessionKey: string; lastEvidenceAt: number; keyClosedAt?: number }
  >()

  const closeSession = (paneKey: string, at: number): void => {
    const session = liveWorking.get(paneKey)
    if (session === undefined) {
      return
    }
    liveWorking.delete(paneKey)
    stats.onAgentStop(session.sessionKey, at, 'hook')
    for (const survivor of liveWorking.values()) {
      if (survivor.sessionKey === session.sessionKey) {
        survivor.keyClosedAt = Math.max(survivor.keyClosedAt ?? 0, at)
      }
    }
  }

  return {
    apply(statuses, now = Date.now()) {
      const present = new Set<string>()
      // Why: multiple stale rows can share a PTY-backed key; one snapshot rotates it once.
      const rotatedSessionKeys = new Set<string>()

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
            // A live turn whose tool call outlasts the horizon splits here too;
            // that granularity residual is documented above.
            if (status.receivedAt - open.lastEvidenceAt > AGENT_STATUS_STALE_AFTER_MS) {
              if (rotatedSessionKeys.has(open.sessionKey)) {
                open.lastEvidenceAt = Math.max(open.lastEvidenceAt, status.receivedAt)
                continue
              }
              rotatedSessionKeys.add(open.sessionKey)
              closeSession(status.paneKey, open.lastEvidenceAt)
            } else {
              const previousEvidenceAt = open.lastEvidenceAt
              open.lastEvidenceAt = Math.max(open.lastEvidenceAt, status.receivedAt)
              // Why reopen: the collector can lose this key while our row stays
              // working — another pane sharing the ptyId (one PTY, two leaves)
              // went idle and closed the shared session. Without this the rest
              // of the turn is counted by nobody. Only a row carrying NEW
              // evidence reopens: a dead agent's frozen row would otherwise
              // mint a phantom zero-time spawn per snapshot once its key was
              // freed. The reopen starts no earlier than the key's last close,
              // or the overlap behind the sibling's boundary would be billed
              // twice.
              if (status.receivedAt > previousEvidenceAt && !stats.hasLiveAgent(open.sessionKey)) {
                const reopenAt = Math.max(status.receivedAt, open.keyClosedAt ?? 0)
                stats.onAgentStart(open.sessionKey, reopenAt, undefined, undefined, 'hook')
              }
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
