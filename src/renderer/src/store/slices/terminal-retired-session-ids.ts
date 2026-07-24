// Why: SSH/daemon "Session was explicitly killed" leaves tabs whose ptyId still
// points at a dead serve-* id. Orphan cleanup previously required ptyId==null,
// so those phantoms survived createTab and remote session rehydration (#10342).

const retiredSessionIds = new Set<string>()

export function markTerminalSessionRetired(sessionId: string | null | undefined): void {
  if (!sessionId) {
    return
  }
  retiredSessionIds.add(sessionId)
}

export function isTerminalSessionRetired(sessionId: string | null | undefined): boolean {
  if (!sessionId) {
    return false
  }
  return retiredSessionIds.has(sessionId)
}

export function markTerminalSessionsRetired(sessionIds: readonly string[]): void {
  for (const sessionId of sessionIds) {
    markTerminalSessionRetired(sessionId)
  }
}

/** @internal tests only */
export function _resetTerminalRetiredSessionIdsForTest(): void {
  retiredSessionIds.clear()
}
