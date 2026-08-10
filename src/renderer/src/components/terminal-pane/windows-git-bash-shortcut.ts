import { WINDOWS_GIT_BASH_SHELL } from '../../../../shared/windows-terminal-shell'
import { resolveWindowsShellOverride } from '@/lib/pane-manager/windows-pty-compatibility'

export function isWindowsGitBashPaneForShortcut(args: {
  isWindowsTerminalHost: boolean
  hasLocalSessionMetadata: boolean
  sessionShellOverride?: string | null
  tabShellOverride?: string | null
  globalWindowsShell?: string | null
}): boolean {
  if (!args.isWindowsTerminalHost || !args.hasLocalSessionMetadata) {
    return false
  }
  return (
    resolveWindowsShellOverride(
      args.sessionShellOverride ?? args.tabShellOverride,
      args.globalWindowsShell
    ) === WINDOWS_GIT_BASH_SHELL
  )
}
