import type { AgentStatusState } from '../../shared/agent-status-types'

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
  onAgentStart: (sessionKey: string, at: number) => void
  onAgentStop: (sessionKey: string, at: number) => void
}

/**
 * Mirrors AgentDetector's working→idle session boundaries, but driven by the
 * hook status pipeline (Claude/Codex/OpenCode/…) instead of OSC titles.
 *
 * Why a separate session key prefix: OSC-based AgentDetector still keys by
 * ptyId; prefixing avoids clobbering concurrent live maps if both paths fire
 * for the same physical agent (hooks are the accurate path; OSC rarely fires).
 */
export function createHookStatusStatsBridge(stats: StatsAgentLifecycle): {
  apply: (statuses: readonly HookStatusStatsInput[], now?: number) => void
  /** Test/inspection helper — paneKeys currently counted as working. */
  getLivePaneKeys: () => string[]
} {
  // paneKey → start timestamp
  const liveWorking = new Map<string, number>()

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
          if (!liveWorking.has(status.paneKey)) {
            liveWorking.set(status.paneKey, status.receivedAt)
            stats.onAgentStart(toHookStatsSessionKey(status.paneKey), status.receivedAt)
          }
          continue
        }

        if (liveWorking.has(status.paneKey)) {
          liveWorking.delete(status.paneKey)
          stats.onAgentStop(toHookStatsSessionKey(status.paneKey), status.receivedAt)
        }
      }

      // Why: a cleared pane (tab close / status drop) leaves no snapshot row;
      // close the open working session so totalAgentTimeMs does not leak.
      for (const paneKey of Array.from(liveWorking.keys())) {
        if (present.has(paneKey)) {
          continue
        }
        liveWorking.delete(paneKey)
        stats.onAgentStop(toHookStatsSessionKey(paneKey), now)
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
