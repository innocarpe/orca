import { isLocalPathOpenBlockedForRuntimeOwner } from '@/lib/local-path-open-guard'
import { getExplicitRuntimeEnvironmentIdForWorktree } from '@/lib/worktree-runtime-owner'

export function isFileExplorerRevealBlocked(
  state: Parameters<typeof getExplicitRuntimeEnvironmentIdForWorktree>[0] & {
    repos?: readonly { id: string; connectionId?: string | null }[]
    worktreesByRepo?: Record<string, readonly { id: string; repoId: string }[]>
  },
  worktreeId: string | null | undefined
): boolean {
  const activeWorktree = Object.values(state.worktreesByRepo ?? {})
    .flat()
    .find((worktree) => worktree.id === worktreeId)
  const activeRepo = activeWorktree
    ? state.repos?.find((repo) => repo.id === activeWorktree.repoId)
    : null
  return isLocalPathOpenBlockedForRuntimeOwner(
    state.settings,
    getExplicitRuntimeEnvironmentIdForWorktree(state, worktreeId),
    { connectionId: activeRepo?.connectionId ?? null }
  )
}
