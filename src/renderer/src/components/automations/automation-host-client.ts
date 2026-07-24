import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import type {
  Automation,
  AutomationCreateInput,
  AutomationRun,
  AutomationUpdateInput
} from '../../../../shared/automations-types'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import type { GlobalSettings } from '../../../../shared/types'

type RuntimeAutomationCreateInput = Omit<
  AutomationCreateInput,
  'projectId' | 'workspaceId' | 'timezone'
> & {
  repo?: string
  workspace?: string
  timezone?: string
}

type RuntimeAutomationUpdateInput = Omit<AutomationUpdateInput, 'projectId' | 'workspaceId'> & {
  repo?: string
  workspace?: string
}

export type AutomationHostTarget =
  | { kind: 'local' }
  | { kind: 'environment'; environmentId: string }

export function getAutomationTargetFromHostId(
  hostId: string | null | undefined
): AutomationHostTarget {
  const parsed = parseExecutionHostId(hostId)
  return parsed?.kind === 'runtime'
    ? { kind: 'environment', environmentId: parsed.environmentId }
    : { kind: 'local' }
}

export function getAutomationListTarget(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined
): AutomationHostTarget {
  const environmentId = settings?.activeRuntimeEnvironmentId?.trim()
  return environmentId ? { kind: 'environment', environmentId } : { kind: 'local' }
}

export function getAutomationHostTargetKey(target: AutomationHostTarget): string {
  return target.kind === 'environment' ? `environment:${target.environmentId}` : 'local'
}

export function getAutomationHostTargetFromKey(key: string | null): AutomationHostTarget | null {
  if (!key) {
    return null
  }
  if (key.startsWith('environment:')) {
    const environmentId = key.slice('environment:'.length).trim()
    // Why: bare "environment:" must not override the global list fallback (#10187 review).
    if (!environmentId) {
      return null
    }
    return { kind: 'environment', environmentId }
  }
  if (key === 'local') {
    return { kind: 'local' }
  }
  return null
}

/**
 * Resolve which host the Automations page should list against.
 * Pending navigation wins, then an explicit page selection, then the global
 * active runtime focus (legacy default).
 */
export function resolveAutomationListHostTarget(args: {
  pendingHostId?: string | null
  selectedKey: string | null
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined
}): AutomationHostTarget {
  if (args.pendingHostId) {
    return getAutomationTargetFromHostId(args.pendingHostId)
  }
  return getAutomationHostTargetFromKey(args.selectedKey) ?? getAutomationListTarget(args.settings)
}

export type AutomationListHostOption = {
  key: string
  label: string
  target: AutomationHostTarget
}

export function buildAutomationListHostOptions(args: {
  localLabel: string
  environments: readonly { id: string; name: string }[]
}): AutomationListHostOption[] {
  return [
    { key: 'local', label: args.localLabel, target: { kind: 'local' } },
    ...args.environments.map((environment) => ({
      key: getAutomationHostTargetKey({ kind: 'environment', environmentId: environment.id }),
      label: environment.name || environment.id,
      target: { kind: 'environment' as const, environmentId: environment.id }
    }))
  ]
}

export function getAutomationOwnerTarget(
  automation: Pick<Automation, 'runContext'>,
  sourceTarget?: AutomationHostTarget | null
): AutomationHostTarget {
  if (sourceTarget?.kind === 'environment') {
    return sourceTarget
  }
  return getAutomationTargetFromHostId(automation.runContext?.hostId)
}

export function getAutomationCreateTarget(input: AutomationCreateInput): AutomationHostTarget {
  return getAutomationTargetFromHostId(input.runContext?.hostId)
}

function toRuntimeAutomationCreateInput(
  input: AutomationCreateInput
): RuntimeAutomationCreateInput {
  const { projectId, workspaceId, ...rest } = input
  return {
    ...rest,
    repo: projectId,
    workspace: input.workspaceMode === 'existing' ? (workspaceId ?? undefined) : undefined
  }
}

function toRuntimeAutomationUpdateInput(
  input: AutomationUpdateInput
): RuntimeAutomationUpdateInput {
  const { projectId, workspaceId, ...rest } = input
  return {
    ...rest,
    ...(projectId !== undefined ? { repo: projectId } : {}),
    ...(workspaceId !== undefined ? { workspace: workspaceId ?? undefined } : {})
  }
}

export async function listAutomationsForTarget(
  target: AutomationHostTarget
): Promise<Automation[]> {
  if (target.kind === 'local') {
    return await window.api.automations.list()
  }
  const result = await callRuntimeRpc<{ automations: Automation[] }>(
    target,
    'automation.list',
    undefined,
    { timeoutMs: 15_000 }
  )
  return result.automations
}

export async function listAutomationRunsForTarget(
  target: AutomationHostTarget,
  automationId?: string
): Promise<AutomationRun[]> {
  if (target.kind === 'local') {
    return await window.api.automations.listRuns(automationId ? { automationId } : undefined)
  }
  const result = await callRuntimeRpc<{ runs: AutomationRun[] }>(
    target,
    'automation.runs',
    automationId ? { automationId } : {},
    { timeoutMs: 15_000 }
  )
  return result.runs
}

export async function createAutomationForTarget(input: AutomationCreateInput): Promise<Automation> {
  const target = getAutomationCreateTarget(input)
  if (target.kind === 'local') {
    return await window.api.automations.create(input)
  }
  const result = await callRuntimeRpc<{ automation: Automation }>(
    target,
    'automation.create',
    toRuntimeAutomationCreateInput(input),
    { timeoutMs: 15_000 }
  )
  return result.automation
}

export async function updateAutomationForTarget(
  automation: Automation,
  updates: AutomationUpdateInput,
  sourceTarget?: AutomationHostTarget | null
): Promise<Automation> {
  const target = getAutomationOwnerTarget(automation, sourceTarget)
  if (target.kind === 'local') {
    return await window.api.automations.update({ id: automation.id, updates })
  }
  const result = await callRuntimeRpc<{ automation: Automation }>(
    target,
    'automation.update',
    { id: automation.id, updates: toRuntimeAutomationUpdateInput(updates) },
    { timeoutMs: 15_000 }
  )
  return result.automation
}

export async function deleteAutomationForTarget(
  automation: Automation,
  sourceTarget?: AutomationHostTarget | null
): Promise<void> {
  const target = getAutomationOwnerTarget(automation, sourceTarget)
  if (target.kind === 'local') {
    await window.api.automations.delete({ id: automation.id })
    return
  }
  await callRuntimeRpc(target, 'automation.delete', { id: automation.id }, { timeoutMs: 15_000 })
}

export async function runAutomationNowForTarget(
  automation: Automation,
  sourceTarget?: AutomationHostTarget | null
): Promise<AutomationRun> {
  const target = getAutomationOwnerTarget(automation, sourceTarget)
  if (target.kind === 'local') {
    return await window.api.automations.runNow({ id: automation.id })
  }
  const result = await callRuntimeRpc<{ run: AutomationRun }>(
    target,
    'automation.runNow',
    { id: automation.id },
    { timeoutMs: 15_000 }
  )
  return result.run
}
