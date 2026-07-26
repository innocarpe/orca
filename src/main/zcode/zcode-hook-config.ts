import {
  MANAGED_HOOK_TIMEOUT_MILLISECONDS,
  createManagedCommandMatcher,
  isPlainObject
} from '../agent-hooks/installer-utils'

// Why: mirror Claude-compatible lifecycle events ZCode documents
// (https://zcode.z.ai/en/docs/hooks) so Orca status tracks working/waiting/done.
export const ZCODE_HOOK_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'Stop'
] as const

export type ZcodeHookEventName = (typeof ZCODE_HOOK_EVENTS)[number]

// Why: apply() forces hooks.enabled=true; stash prior value so remove() can restore it.
export const ORCA_PREVIOUS_HOOKS_ENABLED_KEY = 'orcaPreviousHooksEnabled'

export type ZcodeHookCommand = {
  type?: string
  command?: string
  args?: string[]
  enabled?: boolean
  timeoutMs?: number
  [key: string]: unknown
}

export type ZcodeHookDefinition = {
  matcher?: string
  hooks?: ZcodeHookCommand[]
  [key: string]: unknown
}

export type ZcodeHooksRoot = {
  enabled?: boolean
  timeoutMs?: number
  maxOutputBytes?: number
  events?: Record<string, ZcodeHookDefinition[]>
  [key: string]: unknown
}

export type ZcodeConfig = {
  hooks?: ZcodeHooksRoot
  [key: string]: unknown
}

function asDefinitionArray(value: unknown): ZcodeHookDefinition[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((entry): entry is ZcodeHookDefinition => isPlainObject(entry))
}

function buildManagedHookCommand(command: string): ZcodeHookCommand {
  return {
    type: 'command',
    command,
    enabled: true,
    // Why: ZCode uses timeoutMs (ms); Claude-style `timeout` is seconds and is secondary.
    timeoutMs: MANAGED_HOOK_TIMEOUT_MILLISECONDS
  }
}

function definitionHasManagedCommand(
  definition: ZcodeHookDefinition,
  isManagedCommand: (command: string | undefined) => boolean
): boolean {
  const hooks = Array.isArray(definition.hooks) ? definition.hooks : []
  return hooks.some((hook) =>
    isManagedCommand(typeof hook.command === 'string' ? hook.command : undefined)
  )
}

function stripManagedCommands(
  definitions: ZcodeHookDefinition[],
  isManagedCommand: (command: string | undefined) => boolean
): ZcodeHookDefinition[] {
  const next: ZcodeHookDefinition[] = []
  for (const definition of definitions) {
    const hooks = Array.isArray(definition.hooks) ? definition.hooks : []
    const cleanedHooks = hooks.filter(
      (hook) => !isManagedCommand(typeof hook.command === 'string' ? hook.command : undefined)
    )
    if (cleanedHooks.length === 0) {
      // Why: drop empty matchers Orca owned; leave user matchers that still have hooks.
      if (hooks.length > 0 && hooks.every((hook) => isManagedCommand(hook.command))) {
        continue
      }
      if (hooks.length === 0 && !definition.command) {
        continue
      }
    }
    next.push({ ...definition, hooks: cleanedHooks })
  }
  return next
}

export function applyManagedZcodeHooks(
  config: ZcodeConfig,
  command: string,
  scriptFileName: string
): ZcodeConfig {
  const isManagedCommand = createManagedCommandMatcher(scriptFileName)
  const hooksRoot: ZcodeHooksRoot = isPlainObject(config.hooks) ? { ...config.hooks } : {}
  const events: Record<string, ZcodeHookDefinition[]> = isPlainObject(hooksRoot.events)
    ? { ...hooksRoot.events }
    : {}
  const managedEvents = new Set<string>(ZCODE_HOOK_EVENTS)

  // Why: sweep managed entries from retired events so reinstall converges.
  for (const [eventName, definitions] of Object.entries(events)) {
    if (managedEvents.has(eventName)) {
      continue
    }
    const cleaned = stripManagedCommands(asDefinitionArray(definitions), isManagedCommand)
    if (cleaned.length === 0) {
      delete events[eventName]
    } else {
      events[eventName] = cleaned
    }
  }

  for (const eventName of ZCODE_HOOK_EVENTS) {
    const current = stripManagedCommands(asDefinitionArray(events[eventName]), isManagedCommand)
    const managedDefinition: ZcodeHookDefinition = {
      matcher: '*',
      hooks: [buildManagedHookCommand(command)]
    }
    events[eventName] = [...current, managedDefinition]
  }

  // Why: ZCode only executes hooks when hooks.enabled is true at the config root.
  // Capture pre-install value once so reinstall does not overwrite the original.
  if (!(ORCA_PREVIOUS_HOOKS_ENABLED_KEY in hooksRoot)) {
    hooksRoot[ORCA_PREVIOUS_HOOKS_ENABLED_KEY] = hooksRoot.enabled === true
  }
  hooksRoot.enabled = true
  hooksRoot.events = events
  return { ...config, hooks: hooksRoot }
}

export function removeManagedZcodeHooks(config: ZcodeConfig, scriptFileName: string): ZcodeConfig {
  if (!isPlainObject(config.hooks) || !isPlainObject(config.hooks.events)) {
    return config
  }
  const isManagedCommand = createManagedCommandMatcher(scriptFileName)
  const hooksRoot: ZcodeHooksRoot = { ...config.hooks }
  const events: Record<string, ZcodeHookDefinition[]> = { ...hooksRoot.events }

  for (const [eventName, definitions] of Object.entries(events)) {
    const cleaned = stripManagedCommands(asDefinitionArray(definitions), isManagedCommand)
    if (cleaned.length === 0) {
      delete events[eventName]
    } else {
      events[eventName] = cleaned
    }
  }

  hooksRoot.events = events
  // Why: restore pre-install hooks.enabled when Orca forced it true for managed hooks.
  if (ORCA_PREVIOUS_HOOKS_ENABLED_KEY in hooksRoot) {
    hooksRoot.enabled = hooksRoot[ORCA_PREVIOUS_HOOKS_ENABLED_KEY] === true
    delete hooksRoot[ORCA_PREVIOUS_HOOKS_ENABLED_KEY]
  }
  return { ...config, hooks: hooksRoot }
}

export function readManagedZcodeHookEvents(config: ZcodeConfig, command: string): Set<string> {
  const present = new Set<string>()
  const events =
    isPlainObject(config.hooks) && isPlainObject(config.hooks.events) ? config.hooks.events : null
  if (!events) {
    return present
  }
  for (const eventName of ZCODE_HOOK_EVENTS) {
    const definitions = asDefinitionArray(events[eventName])
    const hasCommand = definitions.some((definition) =>
      definitionHasManagedCommand(definition, (candidate) => candidate === command)
    )
    if (hasCommand) {
      present.add(eventName)
    }
  }
  return present
}

export function isZcodeHooksEnabled(config: ZcodeConfig): boolean {
  return isPlainObject(config.hooks) && config.hooks.enabled === true
}
