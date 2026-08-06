import { describe, expect, it } from 'vitest'

import { agentKindToTuiAgent, tuiAgentToAgentKind } from './agent-kind'
import { AGENT_KIND_VALUES, agentKindSchema } from './telemetry-events'
import { isTuiAgent, TUI_AGENT_CONFIG } from './tui-agent-config'
import { TUI_AGENT_DISPLAY_NAMES } from './tui-agent-display-names'
import type { TuiAgent } from './types'

describe('tuiAgentToAgentKind', () => {
  it('maps every shipped TuiAgent to a concrete telemetry kind', () => {
    const agents = Object.keys(TUI_AGENT_CONFIG) as TuiAgent[]

    for (const agent of agents) {
      const kind = tuiAgentToAgentKind(agent)

      expect(kind).not.toBe('other')
      expect(agentKindSchema.safeParse(kind).success).toBe(true)
    }
  })

  it('keeps concrete telemetry kinds in exact sync with shipped TuiAgents', () => {
    const agents = Object.keys(TUI_AGENT_CONFIG) as TuiAgent[]
    const mappedKinds = agents.map((agent) => tuiAgentToAgentKind(agent)).sort()
    const concreteSchemaKinds = AGENT_KIND_VALUES.filter((kind) => kind !== 'other').sort()

    expect(mappedKinds).toEqual(concreteSchemaKinds)
  })

  it('uses the product id for Claude and the TuiAgent id for Pi', () => {
    expect(tuiAgentToAgentKind('claude')).toBe('claude-code')
    expect(tuiAgentToAgentKind('pi')).toBe('pi')
  })

  it('registers Reasonix as a first-class TUI agent', () => {
    expect(isTuiAgent('reasonix')).toBe(true)
    expect(TUI_AGENT_CONFIG.reasonix).toMatchObject({
      detectCmd: 'reasonix',
      launchCmd: 'reasonix',
      expectedProcess: 'reasonix',
      promptInjectionMode: 'stdin-after-start'
    })
    expect(TUI_AGENT_DISPLAY_NAMES.reasonix).toBe('Reasonix')
    expect(tuiAgentToAgentKind('reasonix')).toBe('reasonix')
  })
})

describe('agentKindToTuiAgent', () => {
  it('round-trips every shipped TuiAgent through its telemetry kind', () => {
    const agents = Object.keys(TUI_AGENT_CONFIG) as TuiAgent[]
    for (const agent of agents) {
      expect(agentKindToTuiAgent(tuiAgentToAgentKind(agent))).toBe(agent)
    }
  })

  it("reverses Claude's product id back to the TuiAgent id", () => {
    expect(agentKindToTuiAgent('claude-code')).toBe('claude')
  })

  it('returns null for the catch-all and missing kinds', () => {
    expect(agentKindToTuiAgent('other')).toBeNull()
    expect(agentKindToTuiAgent(null)).toBeNull()
    expect(agentKindToTuiAgent(undefined)).toBeNull()
  })
})
