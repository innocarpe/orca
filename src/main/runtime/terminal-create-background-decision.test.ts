import { describe, expect, it } from 'vitest'
import { shouldCreateTerminalInBackground } from './terminal-create-background-decision'

describe('shouldCreateTerminalInBackground', () => {
  it('returns false when no worktree selector is provided', () => {
    expect(
      shouldCreateTerminalInBackground({
        worktreeSelector: undefined,
        agentSessionClaim: false,
        requiresRendererFocus: true,
        rendererBacked: false,
        hasAuthoritativeWindow: false
      })
    ).toBe(false)
  })

  it('prefers background for agent session claims', () => {
    expect(
      shouldCreateTerminalInBackground({
        worktreeSelector: 'wt-1',
        agentSessionClaim: true,
        requiresRendererFocus: true,
        rendererBacked: true,
        hasAuthoritativeWindow: true
      })
    ).toBe(true)
  })

  it('uses background for non-focus non-renderer-backed creates', () => {
    expect(
      shouldCreateTerminalInBackground({
        worktreeSelector: 'wt-1',
        agentSessionClaim: false,
        requiresRendererFocus: false,
        rendererBacked: false,
        hasAuthoritativeWindow: true
      })
    ).toBe(true)
  })

  it('keeps focus creates on renderer when a window exists', () => {
    expect(
      shouldCreateTerminalInBackground({
        worktreeSelector: 'wt-1',
        agentSessionClaim: false,
        requiresRendererFocus: true,
        rendererBacked: false,
        hasAuthoritativeWindow: true
      })
    ).toBe(false)
  })

  it('falls back to background for focus creates without a renderer window (orca serve)', () => {
    // Repro #10333: Mac UI + / terminal create --focus on headless remote server
    expect(
      shouldCreateTerminalInBackground({
        worktreeSelector: 'wt-1',
        agentSessionClaim: false,
        requiresRendererFocus: true,
        rendererBacked: false,
        hasAuthoritativeWindow: false
      })
    ).toBe(true)
  })

  it('falls back to background for renderer-backed creates without a window', () => {
    expect(
      shouldCreateTerminalInBackground({
        worktreeSelector: 'wt-1',
        agentSessionClaim: false,
        requiresRendererFocus: false,
        rendererBacked: true,
        hasAuthoritativeWindow: false
      })
    ).toBe(true)
  })

  it('keeps renderer-backed creates on renderer when a window exists', () => {
    expect(
      shouldCreateTerminalInBackground({
        worktreeSelector: 'wt-1',
        agentSessionClaim: false,
        requiresRendererFocus: false,
        rendererBacked: true,
        hasAuthoritativeWindow: true
      })
    ).toBe(false)
  })
})
