/**
 * The hook status stats bridge keys its StatsCollector sessions by the ptyId this
 * method returns, so that both it and the OSC AgentDetector land on one session
 * for the same pane. If it ever returns null the bridge silently falls back to a
 * `hook:` key and every OSC-visible pane is counted twice again — the exact
 * regression #10396 exists to prevent, and one that no stats test can see because
 * those inject their own resolver.
 */
import { describe, expect, it } from 'vitest'
import { OrcaRuntimeService } from './orca-runtime'

const PANE_KEY = 'tab-1:6c1a5f7e-6a3c-4a55-8a4d-9d0d3b0e6f11'

type RuntimeInternals = {
  ptysById: Map<string, { ptyId: string; paneKey: string | null; connected: boolean }>
  leaves: Map<string, { ptyId: string | null }>
}

function seedPty(
  runtime: OrcaRuntimeService,
  pty: { ptyId: string; paneKey: string | null; connected: boolean }
): void {
  ;(runtime as unknown as RuntimeInternals).ptysById.set(pty.ptyId, pty)
}

/** Mirrors getLeafKey's `${tabId}::${leafId}` layout. */
function seedLeaf(runtime: OrcaRuntimeService, paneKey: string, ptyId: string): void {
  const [tabId, leafId] = paneKey.split(':')
  ;(runtime as unknown as RuntimeInternals).leaves.set(`${tabId}::${leafId}`, { ptyId })
}

describe('OrcaRuntimeService.getTerminalPtyIdForPaneKey', () => {
  it('resolves through the mounted leaf, the path production hits first', () => {
    const runtime = new OrcaRuntimeService()
    seedLeaf(runtime, PANE_KEY, 'pty-leaf')
    seedPty(runtime, { ptyId: 'pty-leaf', paneKey: null, connected: true })

    // The leaf-backed PTY carries no paneKey of its own, so only the leaf lookup
    // can find it — a resolver that relied on the linear scan alone returns null.
    expect(runtime.getTerminalPtyIdForPaneKey(PANE_KEY)).toBe('pty-leaf')
  })

  it('resolves the pane to the PTY backing it', () => {
    const runtime = new OrcaRuntimeService()
    seedPty(runtime, { ptyId: 'pty-1', paneKey: PANE_KEY, connected: true })

    expect(runtime.getTerminalPtyIdForPaneKey(PANE_KEY)).toBe('pty-1')
  })

  it('prefers the connected PTY when a disconnected one still claims the pane', () => {
    const runtime = new OrcaRuntimeService()
    seedPty(runtime, { ptyId: 'pty-old', paneKey: PANE_KEY, connected: false })
    seedPty(runtime, { ptyId: 'pty-new', paneKey: PANE_KEY, connected: true })

    expect(runtime.getTerminalPtyIdForPaneKey(PANE_KEY)).toBe('pty-new')
  })

  it('returns null for a pane no PTY claims', () => {
    const runtime = new OrcaRuntimeService()
    seedPty(runtime, { ptyId: 'pty-1', paneKey: 'tab-9:0', connected: true })

    expect(runtime.getTerminalPtyIdForPaneKey(PANE_KEY)).toBeNull()
  })
})
