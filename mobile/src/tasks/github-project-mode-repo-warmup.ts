export async function warmGitHubProjectModeRepos(
  cachedRepoCount: number,
  loadRepos: () => Promise<unknown>,
  isCurrent: () => boolean,
  setItems: (items: never[]) => void
): Promise<void> {
  if (cachedRepoCount === 0) {
    await loadRepos()
  }
  if (isCurrent()) {
    setItems([])
  }
}
