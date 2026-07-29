/** Pure delivery policy for orchestration push-on-idle injection. */

export function shouldDeferOrchestrationInjection(args: { isUserFocused: boolean }): boolean {
  // Why: writing into a user-focused leaf clobbers any draft they are still typing.
  return args.isUserFocused
}

export function isOrchestrationLeafUserFocused(args: {
  leafTabId: string
  leafId: string
  activeTabId: string | null | undefined
  activeLeafId: string | null | undefined
}): boolean {
  // Why: without a known active tab we cannot distinguish user focus from idle workers.
  if (!args.activeTabId || args.activeTabId !== args.leafTabId) {
    return false
  }
  // Why: null activeLeafId means the whole terminal tab is the focus surface.
  return !args.activeLeafId || args.activeLeafId === args.leafId
}

export function shouldSynthesizeOrchestrationEnter(args: {
  isUserFocused: boolean
  isActiveCoordinator: boolean
  isCursorTarget: boolean
  hasActiveCoordinatorRun: boolean
}): boolean {
  // Why: Enter is only safe for unattended worker panes under an active orchestration run.
  // No run (task-create+dispatch without `orchestration run`) often means a human pane.
  if (!args.hasActiveCoordinatorRun) {
    return false
  }
  if (args.isUserFocused || args.isActiveCoordinator || args.isCursorTarget) {
    return false
  }
  return true
}
