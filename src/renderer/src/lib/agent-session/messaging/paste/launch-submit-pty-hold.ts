import type { TuiAgent } from '../../../../../../shared/agent-launch/catalog/tui-agent'
import { inspectRuntimeTerminalProcess } from '@/runtime/hosted-terminals/inspection/runtime-terminal-process-inspection'
import {
  isAgentForegroundProcess,
  isAgentForegroundWrapperProcess
} from '../../../../../../shared/agent-status/process/agent-process-recognition'
import { isShellProcess } from '../../../../../../shared/agent-status/process/shell-process-detection'

// Composer bytes can outlive the CLI. Enter must not land in the shell that replaced it.
export async function launchSubmitTargetStillHoldsPty(
  ptyId: string,
  agent: TuiAgent
): Promise<boolean> {
  try {
    const process = await inspectRuntimeTerminalProcess(ptyId)
    const foreground = process.foregroundProcess?.toLowerCase() ?? ''
    return (
      isAgentForegroundProcess(foreground, agent) ||
      (isAgentForegroundWrapperProcess(foreground) &&
        !isShellProcess(foreground) &&
        process.hasChildProcesses === true)
    )
  } catch {
    return false
  }
}
