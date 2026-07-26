import { ipcMain } from 'electron'
import type { AgentHookInstallStatus } from '../../shared/agent-hook-types'
import type {
  AgentStatusIpcPayload,
  MigrationUnsupportedPtyEntry
} from '../../shared/agent-status-types'
import type { AgentInterruptInferenceRequest } from '../../shared/agent-interrupt-intent'
import type { AgentQuestionAnsweredInferenceRequest } from '../../shared/agent-question-answered-intent'
import { agentHookServer, isValidPaneKey } from '../agent-hooks/server'
import { ampHookService } from '../amp/hook-service'
import {
  clearMigrationUnsupportedPtysByTabPrefix,
  clearMigrationUnsupportedPtysForPaneKey,
  getMigrationUnsupportedPtySnapshot
} from '../agent-hooks/migration-unsupported-pty-state'
import { claudeHookService } from '../claude/hook-service'
import { codexHookService } from '../codex/hook-service'
import { geminiHookService } from '../gemini/hook-service'
import { antigravityHookService } from '../antigravity/hook-service'
import { cursorHookService } from '../cursor/hook-service'
import { droidHookService } from '../droid/hook-service'
import { commandCodeHookService } from '../command-code/hook-service'
import { grokHookService } from '../grok/hook-service'
import { copilotHookService } from '../copilot/hook-service'
import { hermesHookService } from '../hermes/hook-service'
import { devinHookService } from '../devin/hook-service'
import { kimiHookService } from '../kimi/hook-service'
import { openClaudeHookService } from '../openclaude/hook-service'
import { zcodeHookService } from '../zcode/hook-service'
import { registerAgentPaneAuthorityIpcHandlers } from './agent-pane-authority-ipc'
import { createAgentPaneAuthorityOwnership } from './agent-pane-authority-ownership'
import {
  enrichAgentStatusIpcPayload,
  isValidAgentStatusDropTabId,
  type AgentStatusRuntimeEnrichment
} from './agent-status-ipc-boundary'

type AgentHookHandlerDependencies = {
  getPtyIdForPaneKey?: (paneKey: string) => string | undefined
}

// Why: channel name differs from agent id for camelCase IPC (openClaude/commandCode).
const AGENT_HOOK_STATUS_HANDLERS: readonly {
  channel: string
  agent: AgentHookInstallStatus['agent']
  getStatus: () => AgentHookInstallStatus
}[] = [
  {
    channel: 'agentHooks:claudeStatus',
    agent: 'claude',
    getStatus: () => claudeHookService.getStatus()
  },
  {
    channel: 'agentHooks:openClaudeStatus',
    agent: 'openclaude',
    getStatus: () => openClaudeHookService.getStatus()
  },
  {
    channel: 'agentHooks:codexStatus',
    agent: 'codex',
    getStatus: () => codexHookService.getStatus()
  },
  {
    channel: 'agentHooks:geminiStatus',
    agent: 'gemini',
    getStatus: () => geminiHookService.getStatus()
  },
  {
    channel: 'agentHooks:antigravityStatus',
    agent: 'antigravity',
    getStatus: () => antigravityHookService.getStatus()
  },
  { channel: 'agentHooks:ampStatus', agent: 'amp', getStatus: () => ampHookService.getStatus() },
  {
    channel: 'agentHooks:cursorStatus',
    agent: 'cursor',
    getStatus: () => cursorHookService.getStatus()
  },
  {
    channel: 'agentHooks:droidStatus',
    agent: 'droid',
    getStatus: () => droidHookService.getStatus()
  },
  {
    channel: 'agentHooks:commandCodeStatus',
    agent: 'command-code',
    getStatus: () => commandCodeHookService.getStatus()
  },
  { channel: 'agentHooks:grokStatus', agent: 'grok', getStatus: () => grokHookService.getStatus() },
  {
    channel: 'agentHooks:copilotStatus',
    agent: 'copilot',
    getStatus: () => copilotHookService.getStatus()
  },
  {
    channel: 'agentHooks:hermesStatus',
    agent: 'hermes',
    getStatus: () => hermesHookService.getStatus()
  },
  {
    channel: 'agentHooks:devinStatus',
    agent: 'devin',
    getStatus: () => devinHookService.getStatus()
  },
  { channel: 'agentHooks:kimiStatus', agent: 'kimi', getStatus: () => kimiHookService.getStatus() },
  {
    channel: 'agentHooks:zcodeStatus',
    agent: 'zcode',
    getStatus: () => zcodeHookService.getStatus()
  }
]

function registerAgentHookStatusHandler(
  channel: string,
  agent: AgentHookInstallStatus['agent'],
  getStatus: () => AgentHookInstallStatus
): void {
  // Why: errors from getStatus() must be reported as state:'error' so the sidebar
  // can render a coherent per-agent error row instead of an unhandled rejection.
  ipcMain.handle(channel, (): AgentHookInstallStatus => {
    try {
      return getStatus()
    } catch (err) {
      return {
        agent,
        state: 'error',
        configPath: '',
        managedHooksPresent: false,
        detail: err instanceof Error ? err.message : String(err)
      }
    }
  })
}

// Why: install/remove are intentionally not exposed to the renderer. Orca
// auto-installs managed hooks at app startup (see src/main/index.ts), so a
// renderer-triggered remove would be silently reverted on the next launch
// and mislead the user.
export function registerAgentHookHandlers(
  runtime?: AgentStatusRuntimeEnrichment,
  dependencies: AgentHookHandlerDependencies = {}
): void {
  // Why: matches the defensive pattern in src/main/ipc/pty.ts so re-registration
  // never throws "Attempted to register a second handler..." if this function is
  // ever invoked more than once (e.g. the macOS app re-activation path that
  // recreates the main window). Today the module-level `registered` guard in
  // register-core-handlers.ts prevents re-entry, but decoupling from that guard
  // future-proofs this file.
  for (const { channel } of AGENT_HOOK_STATUS_HANDLERS) {
    ipcMain.removeHandler(channel)
  }
  ipcMain.removeHandler('agentStatus:getSnapshot')
  ipcMain.removeHandler('agentStatus:inferInterrupt')
  ipcMain.removeHandler('agentStatus:inferQuestionAnswered')
  ipcMain.removeHandler('agentStatus:getMigrationUnsupportedSnapshot')
  // Why: agentStatus:drop is sent fire-and-forget from the renderer via
  // ipcRenderer.send(); we listen with ipcMain.on (not handle) so we don't
  // round-trip a response. Removing first keeps re-registration safe even
  // though the module-level registered guard already prevents re-entry today.
  ipcMain.removeAllListeners('agentStatus:drop')
  ipcMain.removeAllListeners('agentStatus:dropByTabPrefix')
  ipcMain.on('agentStatus:drop', (_event, paneKey: unknown) => {
    if (typeof paneKey !== 'string' || !isValidPaneKey(paneKey)) {
      return
    }
    try {
      // Why: dropStatusEntry (not clearPaneState) is correct here — the user is
      // dismissing a status row, not tearing down a PTY. clearPaneState would also
      // wipe the per-pane prompt/tool caches, which the next hook event for that
      // (still-alive) pane needs to render a coherent row.
      agentHookServer.dropStatusEntry(paneKey)
      clearMigrationUnsupportedPtysForPaneKey(paneKey)
    } catch (err) {
      console.warn('[agent-hooks] dropStatusEntry failed:', err)
    }
  })
  ipcMain.on('agentStatus:dropByTabPrefix', (_event, tabId: unknown) => {
    if (!isValidAgentStatusDropTabId(tabId)) {
      return
    }
    try {
      agentHookServer.dropStatusEntriesByTabPrefix(tabId)
      clearMigrationUnsupportedPtysByTabPrefix(tabId)
    } catch (err) {
      console.warn('[agent-hooks] dropStatusEntriesByTabPrefix failed:', err)
    }
  })
  registerAgentPaneAuthorityIpcHandlers({
    ownsPty: createAgentPaneAuthorityOwnership({
      getPtyIdForPaneKey: dependencies.getPtyIdForPaneKey,
      getRuntimeTerminalHandleForPaneKey: (paneKey) =>
        runtime?.getAgentStatusTerminalHandleForPaneKey(paneKey)
    })
  })
  ipcMain.handle('agentStatus:getSnapshot', (): AgentStatusIpcPayload[] => {
    // Why: the renderer pulls this after workspace hydration, so startup cannot
    // lose replayed statuses while its local store is still empty. Match the
    // live push enrichment in main/index.ts so parent/child rows survive replay.
    return agentHookServer
      .getStatusSnapshot()
      .map((entry) => enrichAgentStatusIpcPayload(entry, runtime))
  })
  ipcMain.handle('agentStatus:inferInterrupt', (_event, request: unknown): boolean => {
    if (typeof request !== 'object' || request === null) {
      return false
    }
    return agentHookServer.inferInterrupt(request as AgentInterruptInferenceRequest)
  })
  ipcMain.handle('agentStatus:inferQuestionAnswered', (_event, request: unknown): boolean => {
    if (typeof request !== 'object' || request === null) {
      return false
    }
    return agentHookServer.inferQuestionAnswered(request as AgentQuestionAnsweredInferenceRequest)
  })
  ipcMain.handle(
    'agentStatus:getMigrationUnsupportedSnapshot',
    (): MigrationUnsupportedPtyEntry[] => getMigrationUnsupportedPtySnapshot()
  )

  for (const { channel, agent, getStatus } of AGENT_HOOK_STATUS_HANDLERS) {
    registerAgentHookStatusHandler(channel, agent, getStatus)
  }
}
