/** Apply repo.list results only when the caller still owns the load (#12991). */
export function commitGitHubProjectModeRepos<T extends { id: string }>(args: {
  repos: T[]
  isCurrent?: () => boolean
  setRepos: (repos: T[]) => void
  reposRef: { current: T[] }
  repoSelectionHydratedRef: { current: boolean }
  defaultRepoSelectionRef: { current: string[] | null }
  setSelectedRepoIds: (value: Set<string> | ((current: Set<string>) => Set<string>)) => void
  reconcileRepoSelection: (repos: T[], defaults: string[] | null) => Set<string>
  isHostedTaskRepo: (repo: T) => boolean
}): void {
  if (args.isCurrent?.() === false) {
    return
  }
  args.reposRef.current = args.repos
  args.setRepos(args.repos)
  if (!args.repoSelectionHydratedRef.current) {
    args.repoSelectionHydratedRef.current = true
    args.setSelectedRepoIds(
      args.reconcileRepoSelection(args.repos, args.defaultRepoSelectionRef.current)
    )
    return
  }
  args.setSelectedRepoIds((current) => {
    if (current.size === 0) {
      return current
    }
    const availableIds = new Set(args.repos.filter(args.isHostedTaskRepo).map((repo) => repo.id))
    const next = new Set([...current].filter((id) => availableIds.has(id)))
    return next.size === current.size ? current : next
  })
}
