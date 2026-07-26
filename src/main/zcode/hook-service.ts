import { homedir } from 'node:os'
import { join } from 'node:path'
import type { SFTPWrapper } from 'ssh2'
import type { AgentHookInstallState, AgentHookInstallStatus } from '../../shared/agent-hook-types'
import {
  buildWindowsAgentHookPostCommand,
  getSharedManagedScriptPath,
  readHooksJson,
  wrapPosixHookCommand,
  wrapWindowsHookCommand,
  writeHooksJson,
  writeManagedScript,
  type HooksConfig
} from '../agent-hooks/installer-utils'
import {
  readHooksJsonRemote,
  writeHooksJsonRemote,
  writeManagedScriptRemote
} from '../agent-hooks/installer-utils-remote'
import {
  buildPosixHookPayloadCapture,
  buildWindowsHookEnvironmentGuardLines,
  buildWindowsHookStdinDrainEpilogue
} from '../agent-hooks/hook-stdin-contract'
import {
  applyManagedZcodeHooks,
  isZcodeHooksEnabled,
  readManagedZcodeHookEvents,
  removeManagedZcodeHooks,
  ZCODE_HOOK_EVENTS,
  type ZcodeConfig
} from './zcode-hook-config'

function getConfigPath(): string {
  // Why: ZCode user-scope hooks live in ~/.zcode/cli/config.json (docs).
  return join(homedir(), '.zcode', 'cli', 'config.json')
}

function getManagedScriptFileName(): string {
  return process.platform === 'win32' ? 'zcode-hook.cmd' : 'zcode-hook.sh'
}

function getManagedScriptPath(): string {
  return getSharedManagedScriptPath(getManagedScriptFileName())
}

function getManagedCommand(scriptPath: string): string {
  return process.platform === 'win32'
    ? wrapWindowsHookCommand(scriptPath)
    : wrapPosixHookCommand(scriptPath)
}

function getManagedScript(target: 'local' | 'posix' = 'local'): string {
  if (target === 'local' && process.platform === 'win32') {
    return [
      '@echo off',
      'setlocal',
      'if defined ORCA_AGENT_HOOK_ENDPOINT if exist "%ORCA_AGENT_HOOK_ENDPOINT%" call "%ORCA_AGENT_HOOK_ENDPOINT%" 2>nul',
      ...buildWindowsHookEnvironmentGuardLines(),
      buildWindowsAgentHookPostCommand('zcode'),
      'exit /b 0',
      ...buildWindowsHookStdinDrainEpilogue(),
      ''
    ].join('\r\n')
  }

  return [
    '#!/bin/sh',
    ...buildPosixHookPayloadCapture(),
    'if [ -n "$ORCA_AGENT_HOOK_ENDPOINT" ] && [ -r "$ORCA_AGENT_HOOK_ENDPOINT" ]; then',
    '  . "$ORCA_AGENT_HOOK_ENDPOINT" 2>/dev/null || :',
    'fi',
    'if [ -z "$ORCA_AGENT_HOOK_PORT" ] || [ -z "$ORCA_AGENT_HOOK_TOKEN" ] || [ -z "$ORCA_PANE_KEY" ]; then',
    '  exit 0',
    'fi',
    // Why: pipe payload to curl stdin so tool output never lands on the argv (EDR false positives).
    'printf \'%s\' "$payload" | curl -sS -X POST "http://127.0.0.1:${ORCA_AGENT_HOOK_PORT}/hook/zcode" \\',
    '  --connect-timeout 0.5 --max-time 1.5 \\',
    '  -H "Content-Type: application/x-www-form-urlencoded" \\',
    '  -H "X-Orca-Agent-Hook-Token: ${ORCA_AGENT_HOOK_TOKEN}" \\',
    '  --data-urlencode "paneKey=${ORCA_PANE_KEY}" \\',
    '  --data-urlencode "tabId=${ORCA_TAB_ID}" \\',
    '  --data-urlencode "launchToken=${ORCA_AGENT_LAUNCH_TOKEN}" \\',
    '  --data-urlencode "worktreeId=${ORCA_WORKTREE_ID}" \\',
    '  --data-urlencode "env=${ORCA_AGENT_HOOK_ENV}" \\',
    '  --data-urlencode "version=${ORCA_AGENT_HOOK_VERSION}" \\',
    '  --data-urlencode "payload@-" >/dev/null 2>&1 || true',
    'exit 0',
    ''
  ].join('\n')
}

function asZcodeConfig(config: ReturnType<typeof readHooksJson>): ZcodeConfig | null {
  if (!config) {
    return null
  }
  return config as ZcodeConfig
}

// Why: ZCode nests hooks under hooks.events; HooksConfig's hooks map type is Claude-shaped. Cast at the write boundary only.
function asHooksConfig(config: ZcodeConfig): HooksConfig {
  return config as HooksConfig
}

function buildStatus(
  present: Set<string>,
  configPath: string,
  hooksEnabled: boolean
): AgentHookInstallStatus {
  const missing = ZCODE_HOOK_EVENTS.filter((event) => !present.has(event))
  let state: AgentHookInstallState
  let detail: string | null
  if (missing.length === 0) {
    if (!hooksEnabled) {
      state = 'partial'
      detail = 'ZCode hooks are disabled (hooks.enabled is not true)'
    } else {
      state = 'installed'
      detail = null
    }
  } else if (present.size === 0) {
    if (!hooksEnabled) {
      state = 'not_installed'
      detail = null
    } else {
      state = 'not_installed'
      detail = null
    }
  } else {
    state = 'partial'
    detail = !hooksEnabled
      ? `ZCode hooks are disabled; managed hook missing for events: ${missing.join(', ')}`
      : `Managed hook missing for events: ${missing.join(', ')}`
  }
  return {
    agent: 'zcode',
    state,
    configPath,
    managedHooksPresent: present.size > 0,
    detail
  }
}

export class ZcodeHookService {
  getStatus(): AgentHookInstallStatus {
    const configPath = getConfigPath()
    const scriptPath = getManagedScriptPath()
    const config = asZcodeConfig(readHooksJson(configPath))
    if (!config) {
      return {
        agent: 'zcode',
        state: 'error',
        configPath,
        managedHooksPresent: false,
        detail: 'Could not parse ZCode cli/config.json'
      }
    }
    const command = getManagedCommand(scriptPath)
    return buildStatus(
      readManagedZcodeHookEvents(config, command),
      configPath,
      isZcodeHooksEnabled(config)
    )
  }

  install(): AgentHookInstallStatus {
    const configPath = getConfigPath()
    const scriptPath = getManagedScriptPath()
    const config = asZcodeConfig(readHooksJson(configPath))
    if (!config) {
      return {
        agent: 'zcode',
        state: 'error',
        configPath,
        managedHooksPresent: false,
        detail: 'Could not parse ZCode cli/config.json'
      }
    }

    const scriptFileName = getManagedScriptFileName()
    const next = applyManagedZcodeHooks(config, getManagedCommand(scriptPath), scriptFileName)
    // Why: script first so config never points at a missing managed script.
    writeManagedScript(scriptPath, getManagedScript())
    writeHooksJson(configPath, asHooksConfig(next))
    return this.getStatus()
  }

  async installRemote(sftp: SFTPWrapper, remoteHome: string): Promise<AgentHookInstallStatus> {
    const home = remoteHome.replace(/\/$/, '')
    const remoteConfigPath = `${home}/.zcode/cli/config.json`
    const remoteScriptPath = `${home}/.orca/agent-hooks/zcode-hook.sh`
    try {
      const config = asZcodeConfig(await readHooksJsonRemote(sftp, remoteConfigPath))
      if (!config) {
        return {
          agent: 'zcode',
          state: 'error',
          configPath: remoteConfigPath,
          managedHooksPresent: false,
          detail: 'Could not parse remote ZCode cli/config.json'
        }
      }

      const next = applyManagedZcodeHooks(
        config,
        wrapPosixHookCommand(remoteScriptPath),
        'zcode-hook.sh'
      )
      await writeManagedScriptRemote(sftp, remoteScriptPath, getManagedScript('posix'))
      await writeHooksJsonRemote(sftp, remoteConfigPath, asHooksConfig(next))

      return {
        agent: 'zcode',
        state: 'installed',
        configPath: remoteConfigPath,
        managedHooksPresent: true,
        detail: null
      }
    } catch (err) {
      return {
        agent: 'zcode',
        state: 'error',
        configPath: remoteConfigPath,
        managedHooksPresent: false,
        detail: err instanceof Error ? err.message : String(err)
      }
    }
  }

  remove(): AgentHookInstallStatus {
    const configPath = getConfigPath()
    const config = asZcodeConfig(readHooksJson(configPath))
    if (!config) {
      return {
        agent: 'zcode',
        state: 'error',
        configPath,
        managedHooksPresent: false,
        detail: 'Could not parse ZCode cli/config.json'
      }
    }

    const next = removeManagedZcodeHooks(config, getManagedScriptFileName())
    writeHooksJson(configPath, asHooksConfig(next))
    return this.getStatus()
  }
}

export const zcodeHookService = new ZcodeHookService()
