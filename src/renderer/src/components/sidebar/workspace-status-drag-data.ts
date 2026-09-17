import { measureClipboardTextByteLength } from '../../../../shared/clipboard-text'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import type { WorkspacePinTarget } from '../../store/slices/worktree-helpers'

export const WORKSPACE_STATUS_DRAG_TYPE = 'application/x-orca-worktree-id'
export const WORKSPACE_STATUS_DRAG_IDS_TYPE = 'application/x-orca-worktree-ids'
export const WORKSPACE_STATUS_DRAG_TARGETS_TYPE = 'application/x-orca-worktree-targets'
export const WORKSPACE_STATUS_DRAG_PAYLOAD_MAX_BYTES = 16 * 1024
export const WORKSPACE_STATUS_DRAG_ID_MAX_COUNT = 512

export function writeWorkspaceDragData(
  dataTransfer: DataTransfer,
  worktreeIdOrIds: string | readonly string[],
  pinTargets?: readonly WorkspacePinTarget[]
): void {
  const worktreeIds = Array.isArray(worktreeIdOrIds) ? worktreeIdOrIds : [worktreeIdOrIds]
  const [firstWorktreeId] = worktreeIds
  if (!firstWorktreeId) {
    return
  }
  dataTransfer.effectAllowed = 'move'
  // Why: keep the original single-id payload for older drop targets while
  // board-to-board drags can move the whole selected batch.
  dataTransfer.setData(WORKSPACE_STATUS_DRAG_TYPE, firstWorktreeId)
  dataTransfer.setData(WORKSPACE_STATUS_DRAG_IDS_TYPE, JSON.stringify(worktreeIds))
  if (pinTargets && pinTargets.length > 0) {
    dataTransfer.setData(WORKSPACE_STATUS_DRAG_TARGETS_TYPE, JSON.stringify(pinTargets))
  }
  dataTransfer.setData('text/plain', firstWorktreeId)
}

export function readWorkspaceDragData(dataTransfer: DataTransfer): string | null {
  const typed = readWorkspaceStatusDragPayload(dataTransfer, WORKSPACE_STATUS_DRAG_TYPE)
  if (typed.status === 'ok') {
    return typed.value
  }
  if (typed.status === 'too-large') {
    return null
  }
  const plain = readWorkspaceStatusDragPayload(dataTransfer, 'text/plain')
  if (plain.status === 'ok') {
    return plain.value
  }
  return null
}

export function readWorkspaceDragDataIds(dataTransfer: DataTransfer): string[] {
  const rawIds = readWorkspaceStatusDragPayload(dataTransfer, WORKSPACE_STATUS_DRAG_IDS_TYPE)
  if (rawIds.status === 'too-large') {
    return []
  }
  if (rawIds.status === 'ok') {
    try {
      const parsed: unknown = JSON.parse(rawIds.value)
      if (Array.isArray(parsed)) {
        return collectWorkspaceStatusDragIds(parsed) ?? []
      }
    } catch {
      // Fall back to the legacy single-card payload below.
    }
  }
  const singleId = readWorkspaceDragData(dataTransfer)
  return singleId ? [singleId] : []
}

export function readWorkspaceDragDataTargets(
  dataTransfer: DataTransfer
): WorkspacePinTarget[] | null {
  const rawTargets = readWorkspaceStatusDragPayload(
    dataTransfer,
    WORKSPACE_STATUS_DRAG_TARGETS_TYPE
  )
  if (rawTargets.status !== 'ok') {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(rawTargets.value)
    return Array.isArray(parsed) ? collectWorkspacePinTargets(parsed) : null
  } catch {
    return null
  }
}

function collectWorkspaceStatusDragIds(values: readonly unknown[]): string[] | null {
  const ids: string[] = []
  for (const value of values) {
    if (typeof value !== 'string' || value.length === 0) {
      continue
    }
    if (ids.length >= WORKSPACE_STATUS_DRAG_ID_MAX_COUNT) {
      return null
    }
    ids.push(value)
  }
  return ids
}

export function hasWorkspaceDragData(dataTransfer: DataTransfer): boolean {
  const types = Array.from(dataTransfer.types)
  return (
    hasBoundedWorkspaceStatusDragPayload(dataTransfer, types, WORKSPACE_STATUS_DRAG_IDS_TYPE) ||
    hasBoundedWorkspaceStatusDragPayload(dataTransfer, types, WORKSPACE_STATUS_DRAG_TARGETS_TYPE) ||
    hasBoundedWorkspaceStatusDragPayload(dataTransfer, types, WORKSPACE_STATUS_DRAG_TYPE) ||
    hasBoundedWorkspaceStatusDragPayload(dataTransfer, types, 'text/plain')
  )
}

function collectWorkspacePinTargets(values: readonly unknown[]): WorkspacePinTarget[] | null {
  const targets: WorkspacePinTarget[] = []
  for (const value of values) {
    if (targets.length >= WORKSPACE_STATUS_DRAG_ID_MAX_COUNT) {
      return null
    }
    if (typeof value === 'string') {
      if (value.length === 0) {
        return null
      }
      targets.push(value)
    } else if (typeof value === 'object' && value !== null) {
      const candidate = value as { worktreeId?: unknown; executionHostId?: unknown }
      const executionHostId =
        typeof candidate.executionHostId === 'string'
          ? parseExecutionHostId(candidate.executionHostId)?.id
          : undefined
      if (
        typeof candidate.worktreeId !== 'string' ||
        candidate.worktreeId.length === 0 ||
        !executionHostId
      ) {
        return null
      }
      targets.push({
        worktreeId: candidate.worktreeId,
        executionHostId
      })
    } else {
      return null
    }
  }
  return targets
}

type WorkspaceStatusDragPayload =
  | { status: 'empty' }
  | { status: 'ok'; value: string }
  | { status: 'too-large' }

function readWorkspaceStatusDragPayload(
  dataTransfer: DataTransfer,
  type: string
): WorkspaceStatusDragPayload {
  const value = dataTransfer.getData(type)
  if (!value) {
    return { status: 'empty' }
  }
  if (
    value.length > WORKSPACE_STATUS_DRAG_PAYLOAD_MAX_BYTES ||
    measureClipboardTextByteLength(value, {
      stopAfterBytes: WORKSPACE_STATUS_DRAG_PAYLOAD_MAX_BYTES
    }).exceededLimit
  ) {
    return { status: 'too-large' }
  }
  return { status: 'ok', value }
}

function hasBoundedWorkspaceStatusDragPayload(
  dataTransfer: DataTransfer,
  types: readonly string[],
  type: string
): boolean {
  return types.includes(type) && readWorkspaceStatusDragPayload(dataTransfer, type).status === 'ok'
}
