import type { AppState } from '@/store/types'
import {
  getRepoExecutionHostId,
  parseExecutionHostId,
  toSshExecutionHostId,
  type ExecutionHostId
} from '../../../shared/execution-host'
import { parseWorkspaceKey } from '../../../shared/workspace-scope'
import { getRepoIdFromWorktreeId } from '@/store/slices/worktree-helpers'
import {
  findFolderWorkspaceOwner,
  getExecutionHostIdForFolderWorkspace,
  type FolderWorkspaceRuntimeOwnerState
} from './folder-workspace-runtime-owner'
import {
  addOperationRoute,
  resolveFromCandidateRoutes,
  type WorktreeOperationRoute,
  type WorktreeOperationRouteResolution
} from './worktree-operation-route-focus'

export type { WorktreeOperationRoute, WorktreeOperationRouteResolution }

type WorktreeOperationOwnerRecord = {
  id: string
  repoId: string
  hostId?: ExecutionHostId
  runtimeOwnerEnvironmentId?: string
}

// settings/runtimeEnvironments come from FolderWorkspaceRuntimeOwnerState's legacy-owner base.
type WorktreeOperationRouteState = FolderWorkspaceRuntimeOwnerState & {
  repos?: readonly Pick<AppState['repos'][number], 'id' | 'connectionId' | 'executionHostId'>[]
  worktreesByRepo?: Record<string, readonly WorktreeOperationOwnerRecord[]>
  detectedWorktreesByRepo?: Record<string, { worktrees: readonly WorktreeOperationOwnerRecord[] }>
  runtimeEnvironmentCatalogHydrated?: boolean
  removedRuntimeEnvironmentIds?: ReadonlySet<string>
}

const repoOperationRouteIndexCache = new WeakMap<
  NonNullable<WorktreeOperationRouteState['repos']>,
  ReadonlyMap<string, WorktreeOperationRouteResolution>
>()

function routeForOwner(owner: {
  hostId?: ExecutionHostId
  runtimeOwnerEnvironmentId?: string
}): WorktreeOperationRoute | null {
  const runtimeOwnerEnvironmentId = owner.runtimeOwnerEnvironmentId?.trim()
  if (!owner.hostId && !runtimeOwnerEnvironmentId) {
    return null
  }
  const parsedHost = parseExecutionHostId(owner.hostId)
  return {
    executionHostId: owner.hostId ?? null,
    runtimeEnvironmentId:
      runtimeOwnerEnvironmentId ||
      (parsedHost?.kind === 'runtime' ? parsedHost.environmentId : null)
  }
}

function collectRepoOperationRoutes(
  repos: WorktreeOperationRouteState['repos'],
  repoId: string
): Map<string, WorktreeOperationRoute> {
  const routes = new Map<string, WorktreeOperationRoute>()
  if (!repos) {
    return routes
  }
  for (const repo of repos) {
    if (repo.id !== repoId) {
      continue
    }
    if (!repo.executionHostId?.trim() && !repo.connectionId?.trim()) {
      continue
    }
    addOperationRoute(routes, routeForOwner({ hostId: getRepoExecutionHostId(repo) }))
  }
  return routes
}

function resolveRepoOperationRoute(
  state: WorktreeOperationRouteState,
  repoId: string
): WorktreeOperationRouteResolution {
  const indexed = resolveIndexedRepoOperationRoute(state.repos, repoId)
  if (indexed.kind !== 'ambiguous') {
    return indexed
  }
  return resolveFromCandidateRoutes(collectRepoOperationRoutes(state.repos, repoId), state.settings)
}

function resolveRepoRouteForSshOwner(
  repos: WorktreeOperationRouteState['repos'],
  owner: WorktreeOperationOwnerRecord
): WorktreeOperationRouteResolution {
  if (!repos || !owner.hostId) {
    return { kind: 'missing' }
  }
  const routes = new Map<string, WorktreeOperationRoute>()
  for (const repo of repos) {
    if (repo.id !== owner.repoId) {
      continue
    }
    const connectionHostId = repo.connectionId ? toSshExecutionHostId(repo.connectionId) : null
    if (getRepoExecutionHostId(repo) !== owner.hostId && connectionHostId !== owner.hostId) {
      continue
    }
    addOperationRoute(routes, routeForOwner({ hostId: getRepoExecutionHostId(repo) }))
  }
  const route = routes.values().next().value
  if (routes.size === 1 && route) {
    return { kind: 'resolved', route }
  }
  return routes.size > 1 ? { kind: 'ambiguous' } : { kind: 'missing' }
}

function resolveExactWorktreeRoute(
  state: WorktreeOperationRouteState,
  owner: WorktreeOperationOwnerRecord
): WorktreeOperationRouteResolution {
  const route = routeForOwner(owner)
  if (!route) {
    return { kind: 'missing' }
  }
  if (route.runtimeEnvironmentId || parseExecutionHostId(route.executionHostId)?.kind !== 'ssh') {
    return { kind: 'resolved', route }
  }
  // Why: recover optional HUB transport only from the matching SSH host; never treat multi-host
  // project as worktree ambiguity when the row already carries its own hostId (#10634).
  const repoRoute = resolveRepoRouteForSshOwner(state.repos, owner)
  if (repoRoute.kind === 'resolved' && repoRoute.route.runtimeEnvironmentId) {
    return {
      kind: 'resolved',
      route: { ...route, runtimeEnvironmentId: repoRoute.route.runtimeEnvironmentId }
    }
  }
  return { kind: 'resolved', route }
}

function collectOwnerRoutes(
  state: WorktreeOperationRouteState,
  owners: Iterable<WorktreeOperationOwnerRecord>,
  worktreeId: string,
  exactRoutes: Map<string, WorktreeOperationRoute>,
  exactRepoIds: Set<string>
): void {
  for (const worktree of owners) {
    if (worktree.id !== worktreeId) {
      continue
    }
    exactRepoIds.add(worktree.repoId)
    const resolution = resolveExactWorktreeRoute(state, worktree)
    if (resolution.kind === 'resolved') {
      addOperationRoute(exactRoutes, resolution.route)
    } else if (resolution.kind === 'ambiguous') {
      // Why: bare SSH route when multi-host repo recovery stays ambiguous; focus may still pick.
      addOperationRoute(exactRoutes, routeForOwner(worktree))
    }
  }
}

export function resolveWorktreeOperationRoute(
  state: WorktreeOperationRouteState,
  worktreeId: string
): WorktreeOperationRoute | null {
  const resolution = resolveWorktreeOperationRouteResult(state, worktreeId)
  return resolution.kind === 'resolved' ? resolution.route : null
}

export function resolveWorktreeOperationRouteResult(
  state: WorktreeOperationRouteState,
  worktreeId: string
): WorktreeOperationRouteResolution {
  // Why: folder workspaces are not Git worktrees — they never appear in the worktree/repo
  // catalogs scanned below, so without this branch a plain local folder workspace reads as an
  // unresolved cross-host identity and every owner-routed operation fails closed (#10251).
  const workspaceScope = parseWorkspaceKey(worktreeId)
  if (workspaceScope?.type === 'folder') {
    return resolveFolderWorkspaceOperationRoute(state, workspaceScope.folderWorkspaceId)
  }
  const explicitResolution = resolveExplicitWorktreeOperationRouteResult(state, worktreeId)
  if (explicitResolution.kind !== 'missing') {
    return explicitResolution
  }

  const hasKnownWorktree =
    Object.values(state.worktreesByRepo ?? {}).some((worktrees) =>
      worktrees.some((worktree) => worktree.id === worktreeId)
    ) ||
    Object.values(state.detectedWorktreesByRepo ?? {}).some((result) =>
      result.worktrees.some((worktree) => worktree.id === worktreeId)
    )
  const repoId = getRepoIdFromWorktreeId(worktreeId)
  const hasKnownRepo = state.repos?.some((repo) => repo.id === repoId) === true
  if (!hasKnownWorktree && !hasKnownRepo) {
    return { kind: 'missing' }
  }

  // Why: pre-owner-projection runtimes published no host fields; terminal routing retains their single focused-runtime behavior.
  const legacyRuntimeEnvironmentId = state.settings?.activeRuntimeEnvironmentId?.trim()
  const savedRuntimeIds = state.runtimeEnvironments?.map((environment) => environment.id.trim())
  const legacyRuntimeIsUnambiguous =
    savedRuntimeIds === undefined ||
    (savedRuntimeIds.length === 1 && savedRuntimeIds[0] === legacyRuntimeEnvironmentId)
  if (legacyRuntimeEnvironmentId && !legacyRuntimeIsUnambiguous) {
    return { kind: 'missing' }
  }
  if (legacyRuntimeEnvironmentId) {
    return {
      kind: 'resolved',
      route: {
        executionHostId: `runtime:${encodeURIComponent(legacyRuntimeEnvironmentId)}`,
        runtimeEnvironmentId: legacyRuntimeEnvironmentId
      }
    }
  }
  const mayBeLegacyLocal =
    (savedRuntimeIds === undefined ||
      (state.runtimeEnvironmentCatalogHydrated === true && savedRuntimeIds.length === 0)) &&
    (state.removedRuntimeEnvironmentIds?.size ?? 0) === 0
  return mayBeLegacyLocal
    ? { kind: 'resolved', route: { executionHostId: 'local', runtimeEnvironmentId: null } }
    : { kind: 'missing' }
}

function resolveFolderWorkspaceOperationRoute(
  state: WorktreeOperationRouteState,
  folderWorkspaceId: string
): WorktreeOperationRouteResolution {
  if (!findFolderWorkspaceOwner(state, folderWorkspaceId)) {
    // Why: deleted/stale folder ids keep failing closed like unknown worktrees.
    return { kind: 'missing' }
  }
  // Why: a found folder record is positive identity evidence, so keep terminal-owner parity;
  // the worktree legacy hydration gates would fail local folders closed whenever unrelated
  // runtimes exist — the exact #10251 symptom.
  const executionHostId = getExecutionHostIdForFolderWorkspace(state, folderWorkspaceId)
  const parsedHost = parseExecutionHostId(executionHostId)
  return {
    kind: 'resolved',
    route: {
      executionHostId,
      runtimeEnvironmentId: parsedHost?.kind === 'runtime' ? parsedHost.environmentId : null
    }
  }
}

export function resolveExplicitWorktreeOperationRouteResult(
  state: WorktreeOperationRouteState,
  worktreeId: string
): WorktreeOperationRouteResolution {
  const exactRoutes = new Map<string, WorktreeOperationRoute>()
  const exactRepoIds = new Set<string>()
  // Why: multi-host dupes share one repoId key; scanning every repo is O(total worktrees) (#10491).
  const repoId = getRepoIdFromWorktreeId(worktreeId)
  const ownedWorktrees = state.worktreesByRepo?.[repoId]
  if (ownedWorktrees) {
    collectOwnerRoutes(state, ownedWorktrees, worktreeId, exactRoutes, exactRepoIds)
  }
  const ownedDetected = state.detectedWorktreesByRepo?.[repoId]?.worktrees
  if (ownedDetected) {
    collectOwnerRoutes(state, ownedDetected, worktreeId, exactRoutes, exactRepoIds)
  }
  if (exactRoutes.size > 0) {
    return resolveFromCandidateRoutes(exactRoutes, state.settings)
  }
  if (exactRepoIds.size === 0) {
    exactRepoIds.add(repoId)
  }
  const repoRoutes = new Map<string, WorktreeOperationRoute>()
  for (const repoId of exactRepoIds) {
    const resolution = resolveRepoOperationRoute(state, repoId)
    if (resolution.kind === 'resolved') {
      addOperationRoute(repoRoutes, resolution.route)
    } else if (resolution.kind === 'ambiguous') {
      for (const route of collectRepoOperationRoutes(state.repos, repoId).values()) {
        addOperationRoute(repoRoutes, route)
      }
    }
  }
  return resolveFromCandidateRoutes(repoRoutes, state.settings)
}

function resolveIndexedRepoOperationRoute(
  repos: WorktreeOperationRouteState['repos'],
  repoId: string
): WorktreeOperationRouteResolution {
  if (!repos) {
    return { kind: 'missing' }
  }
  let index = repoOperationRouteIndexCache.get(repos)
  if (!index) {
    const next = new Map<string, WorktreeOperationRouteResolution>()
    for (const repo of repos) {
      const repoId = repo.id
      if (!repo.executionHostId?.trim() && !repo.connectionId?.trim()) {
        continue
      }
      const route = routeForOwner({ hostId: getRepoExecutionHostId(repo) })
      if (!route) {
        continue
      }
      const current = next.get(repoId)
      if (!current) {
        next.set(repoId, { kind: 'resolved', route })
      } else if (
        current.kind === 'resolved' &&
        JSON.stringify(current.route) !== JSON.stringify(route)
      ) {
        next.set(repoId, { kind: 'ambiguous' })
      }
    }
    index = next
    repoOperationRouteIndexCache.set(repos, index)
  }
  return index.get(repoId) ?? { kind: 'missing' }
}

export function settingsForWorktreeOperationRoute(
  settings: AppState['settings'],
  route: WorktreeOperationRoute
): AppState['settings'] {
  return settings
    ? { ...settings, activeRuntimeEnvironmentId: route.runtimeEnvironmentId }
    : ({ activeRuntimeEnvironmentId: route.runtimeEnvironmentId } as AppState['settings'])
}
