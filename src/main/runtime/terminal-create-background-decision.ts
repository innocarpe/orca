/**
 * Decide whether createTerminal should spawn via the headless/background path
 * instead of renderer IPC.
 *
 * Headless `orca serve` has no BrowserWindow. Focus-requested creates (Mac UI
 * "+", `terminal create --focus`) must fall back to background spawn rather
 * than throw "No renderer window available".
 */
export function shouldCreateTerminalInBackground(args: {
  worktreeSelector: string | undefined
  agentSessionClaim: boolean
  requiresRendererFocus: boolean
  rendererBacked: boolean
  hasAuthoritativeWindow: boolean
}): boolean {
  if (args.worktreeSelector === undefined) {
    return false
  }

  if (args.agentSessionClaim) {
    return true
  }

  if (!args.requiresRendererFocus && !args.rendererBacked) {
    return true
  }

  // Why: no local BrowserWindow (orca serve / headless) — background spawn is
  // the only usable path whether the client asked for focus or rendererBacked.
  if (!args.hasAuthoritativeWindow) {
    return true
  }

  return false
}
