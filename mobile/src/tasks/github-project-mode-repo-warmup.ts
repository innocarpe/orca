export async function warmGitHubProjectModeRepos(
  cachedRepoCount: number,
  // Why: pass isCurrent so loadRepos can refuse stale host writes (#12991 CR).
  loadRepos: (isCurrent: () => boolean) => Promise<unknown>,
  isCurrent: () => boolean,
  setItems: (items: never[]) => void
): Promise<void> {
  if (cachedRepoCount === 0) {
    await loadRepos(isCurrent)
  }
  if (isCurrent()) {
    setItems([])
  }
}
