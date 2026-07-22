import { describe, expect, it, vi } from 'vitest'
import type { AgentStatusEntry } from '../../shared/agent-status-types'
import type { RuntimeMobileSessionTabsSnapshot } from '../../shared/runtime-types'
import { renewRuntimeMobileAgentStatusFromPtyTitle } from './runtime-mobile-agent-status-projection'
import { projectRuntimeMobileSessionTabs } from './runtime-mobile-session-projection'
import type { RuntimeMobileSessionProjectionHost } from './runtime-mobile-session-projection-contract'
import type { RuntimePtyWorktreeRecord } from './runtime-terminal-state-records'

const MESSAGE = '좌→우 가로 파이프라인으로 다시 그렸습니다'

function workingStatus(): AgentStatusEntry {
  return {
    state: 'working',
    prompt: 'stale task',
    updatedAt: 1_700_000_000_000,
    stateStartedAt: 1_699_999_999_000,
    agentType: 'claude',
    paneKey: 'tab:leaf',
    terminalTitle: 'claude working',
    lastAssistantMessage: MESSAGE,
    interrupted: false,
    stateHistory: []
  }
}

describe('demoted idle agent status', () => {
  it('keeps the completion subtitle when a shell title replaces a stale working row', () => {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: renew reads only the title clock and status fields this stub sets.
    const pty = {
      lastOscTitle: 'bash',
      lastOscTitleEpochMs: 1_700_000_000_500,
      lastAgentStatus: 'idle',
      lastAgentStatusStartedAtEpochMs: 1_700_000_000_500,
      lastAgentStatusRichInvalidatedAtEpochMs: 1_700_000_000_400
    } as RuntimePtyWorktreeRecord

    expect(renewRuntimeMobileAgentStatusFromPtyTitle(workingStatus(), pty)).toMatchObject({
      state: 'done',
      prompt: '',
      agentType: 'claude',
      lastAssistantMessage: MESSAGE,
      interrupted: false
    })
  })

  it('keeps the completion subtitle when a neutral leaf title demotes the mobile projection', () => {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the stub sets the pty fields the title clock and handle publication read.
    const pty = {
      ptyId: 'live-pty',
      connected: true,
      incarnationId: 'live-incarnation',
      lastOscTitleEpochMs: null,
      lastAgentStatus: null,
      lastAgentStatusStartedAtEpochMs: null,
      lastAgentStatusRichInvalidatedAtEpochMs: null
    } as RuntimePtyWorktreeRecord
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the stub implements every host member this terminal projection path calls.
    const host = {
      tabs: new Map(),
      leaves: new Map([
        [
          'leaf',
          {
            ptyId: pty.ptyId,
            connected: true,
            paneTitle: 'bash',
            paneTitleUpdatedAt: 1
          }
        ]
      ]),
      ptysById: new Map([[pty.ptyId, pty]]),
      getLiveBrowserTabs: () => new Map(),
      getProviderSessionRows: () => [],
      getProviderSessionSnapshot: () => [],
      getLeafKey: () => 'leaf',
      findPty: () => pty,
      getRetainedStatus: () => null,
      getTrackedTitle: () => null,
      getTitleDisplayClear: () => null,
      issuePtyHandle: vi.fn(() => 'handle'),
      recordPty: vi.fn(() => pty),
      buildPtyStatus: () => ({}),
      sanitizeGroups: () => [],
      pruneGroupLayout: () => null,
      collectTabIds: () => new Set()
    } as unknown as RuntimeMobileSessionProjectionHost
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: one terminal tab is the only snapshot field this projection path reads.
    const snapshot = {
      worktree: 'workspace',
      publicationEpoch: 'headless:epoch',
      tabs: [
        {
          type: 'terminal',
          id: 'tab::leaf',
          parentTabId: 'tab',
          leafId: 'leaf',
          title: 'bash',
          agentStatus: workingStatus(),
          isActive: true
        }
      ]
    } as RuntimeMobileSessionTabsSnapshot

    const tab = projectRuntimeMobileSessionTabs(snapshot, host).tabs[0]
    expect(tab).toMatchObject({
      type: 'terminal',
      agentStatus: {
        state: 'done',
        agentType: 'claude',
        lastAssistantMessage: MESSAGE,
        interrupted: false,
        prompt: ''
      }
    })
    expect(tab?.type === 'terminal' ? tab.agentStatus?.terminalTitle : undefined).toBeUndefined()
  })
})
