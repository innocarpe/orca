/** How long a restored pane waits for the startup status snapshot before connecting anyway. */
export const AGENT_STATUS_STARTUP_SNAPSHOT_WAIT_MS = 5_000

type IdleGate = { phase: 'idle' }
type SettledGate = { phase: 'settled' }
type PendingGate = {
  phase: 'pending'
  epoch: number
  promise: Promise<void>
  resolve: () => void
}

let epoch = 0
let gate: IdleGate | SettledGate | PendingGate = { phase: 'idle' }

/** Opens one in-flight startup snapshot. A second arm while one is open returns the same epoch. */
export function armAgentStatusStartupSnapshot(): number {
  if (gate.phase === 'pending') {
    return gate.epoch
  }
  epoch += 1
  const armed = epoch
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  gate = { phase: 'pending', epoch: armed, promise, resolve }
  return armed
}

/** Releases waiters for this arm only. A newer arm or a reset ignores the stale epoch. */
export function settleAgentStatusStartupSnapshot(armedEpoch: number): void {
  if (gate.phase === 'pending' && gate.epoch === armedEpoch) {
    gate.resolve()
    gate = { phase: 'settled' }
  }
}

/** Drops an in-flight snapshot when the ready window ends, and wakes anyone still waiting. */
export function resetAgentStatusStartupSnapshotGate(): void {
  epoch += 1
  if (gate.phase === 'pending') {
    gate.resolve()
  }
  gate = { phase: 'idle' }
}

/**
 * Resolves immediately when no startup snapshot is in flight. Otherwise waits until that
 * snapshot is applied or abandoned, or until `timeoutMs` elapses.
 */
export function waitForAgentStatusStartupSnapshot(
  timeoutMs = AGENT_STATUS_STARTUP_SNAPSHOT_WAIT_MS
): Promise<void> {
  if (gate.phase !== 'pending') {
    return Promise.resolve()
  }
  const pending = gate.promise
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve()
    }, timeoutMs)
    void pending.then(() => {
      clearTimeout(timer)
      resolve()
    })
  })
}
