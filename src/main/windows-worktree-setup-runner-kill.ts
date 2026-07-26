import { readFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import {
  isPathInsideOrEqual,
  isWindowsAbsolutePathLike,
  normalizeRuntimePathForComparison
} from '../shared/cross-platform-path'
import { splitWorktreeIdForFilesystem } from '../shared/worktree-id'
import {
  queryWindowsProcessRowsFresh,
  type WindowsProcessRow
} from './providers/windows-foreground-process-rows'
import { terminateWindowsProcessTree, type WindowsTreeKiller } from './windows-process-tree-kill'

export type WindowsSetupRunnerKillDeps = {
  platform?: NodeJS.Platform
  listProcessRows?: () => Promise<WindowsProcessRow[]>
  killTree?: WindowsTreeKiller
  /** Extra roots (e.g. resolved gitdir) that own the worktree's setup-runner.cmd. */
  pathAnchors?: readonly string[]
  resolveGitDirPath?: (worktreePath: string) => Promise<string | null>
  /** When set, skip the sweep once the worktree teardown budget has elapsed. */
  deadlineMs?: number
  now?: () => number
}

/** Best-effort linked-worktree gitdir (or bare `.git` dir) for path anchoring. */
export async function resolveWorktreeGitDirPath(
  worktreePath: string,
  deps: { readFileImpl?: typeof readFile } = {}
): Promise<string | null> {
  const trimmed = worktreePath.trim()
  if (!trimmed) {
    return null
  }
  const read = deps.readFileImpl ?? readFile
  try {
    const content = await read(join(trimmed, '.git'), 'utf8')
    const match = content.match(/^gitdir:\s*(.+?)\s*$/im)
    if (!match) {
      return null
    }
    const raw = match[1].trim()
    if (!raw) {
      return null
    }
    if (isAbsolute(raw) || isWindowsAbsolutePathLike(raw)) {
      return raw
    }
    return resolve(trimmed, raw)
  } catch (error) {
    // Why: main checkouts store objects under a `.git` directory, not a gitdir file.
    if ((error as NodeJS.ErrnoException | undefined)?.code === 'EISDIR') {
      return join(trimmed, '.git')
    }
    return null
  }
}

/** Paths of `setup-runner.cmd` embedded in a Windows process CommandLine. */
export function extractSetupRunnerPathsFromCommandLine(commandLine: string): string[] {
  const matches = commandLine.matchAll(/(?:[A-Za-z]:[\\/]|[\\/]{1,2})[^\s"']*?setup-runner\.cmd/gi)
  const paths: string[] = []
  for (const match of matches) {
    if (match[0]) {
      paths.push(match[0])
    }
  }
  return paths
}

/**
 * True when a process CommandLine is running (or embedding) this worktree's
 * `setup-runner.cmd` — including the common linked-worktree gitdir location
 * under `.git/worktrees/<name>/orca/`.
 *
 * Identity is path-anchor based only (worktree path and optional gitdir). A
 * basename-only `.git/worktrees/<name>/…` match would force-kill another
 * repository's same-named linked worktree (#10629 review).
 */
export function commandLineTargetsWorktreeSetupRunner(
  commandLine: string,
  worktreePath: string,
  pathAnchors: readonly string[] = []
): boolean {
  if (!commandLine || !/setup-runner\.cmd/i.test(commandLine)) {
    return false
  }

  const normalizedCommand = normalizeRuntimePathForComparison(commandLine)
  const anchors = new Set<string>()
  const addAnchor = (value: string): void => {
    const normalized = normalizeRuntimePathForComparison(value.trim())
    // Why: single-segment anchors collide across hosts; require a real root path.
    if (normalized.length >= 2) {
      anchors.add(normalized)
    }
  }
  addAnchor(worktreePath)
  for (const anchor of pathAnchors) {
    addAnchor(anchor)
  }

  const runnerPaths = extractSetupRunnerPathsFromCommandLine(commandLine)
  for (const runnerPath of runnerPaths) {
    for (const anchor of anchors) {
      if (isPathInsideOrEqual(anchor, runnerPath)) {
        return true
      }
    }
  }

  // Why: some listings omit drive-qualified paths; still match when the full
  // worktree/gitdir string appears alongside setup-runner.cmd.
  for (const anchor of anchors) {
    if (normalizedCommand.includes(anchor)) {
      return true
    }
  }

  return false
}

/**
 * Worktree-id entry used by destructive teardown: resolves the filesystem path
 * and skips non-Windows / non-Windows-path worktrees.
 */
export async function terminateWindowsSetupRunnersForWorktreeId(
  worktreeId: string,
  deps: WindowsSetupRunnerKillDeps = {}
): Promise<number> {
  const now = deps.now ?? Date.now
  if (deps.deadlineMs !== undefined && now() >= deps.deadlineMs) {
    return 0
  }
  const worktreePath = splitWorktreeIdForFilesystem(worktreeId)?.worktreePath
  if (!worktreePath) {
    return 0
  }
  const killed = await terminateWindowsSetupRunnersForWorktree(worktreePath, deps).catch(() => 0)
  if (killed > 0) {
    console.info(
      `[worktree-teardown] ${worktreeId} killed ${killed} Windows setup-runner process tree(s)`
    )
  }
  return killed
}

/**
 * Force-kill Windows `setup-runner.cmd` process trees tied to `worktreePath`.
 * Best-effort: enumeration/kill failures resolve to 0 so callers can still
 * attempt Git removal (and surface a real filesystem error if handles remain).
 */
export async function terminateWindowsSetupRunnersForWorktree(
  worktreePath: string,
  deps: WindowsSetupRunnerKillDeps = {}
): Promise<number> {
  const platform = deps.platform ?? process.platform
  if (platform !== 'win32') {
    return 0
  }
  const trimmed = worktreePath.trim()
  if (!trimmed || !isWindowsAbsolutePathLike(trimmed)) {
    return 0
  }

  const pathAnchors = [...(deps.pathAnchors ?? [])]
  if (deps.pathAnchors === undefined) {
    const resolveGitDir = deps.resolveGitDirPath ?? resolveWorktreeGitDirPath
    const gitDir = await resolveGitDir(trimmed).catch(() => null)
    if (gitDir) {
      pathAnchors.push(gitDir)
    }
  }

  let rows: WindowsProcessRow[]
  try {
    const list = deps.listProcessRows ?? queryWindowsProcessRowsFresh
    rows = await list()
  } catch {
    return 0
  }

  const killTree = deps.killTree ?? terminateWindowsProcessTree
  const targetPids = new Set<number>()
  for (const row of rows) {
    if (!Number.isInteger(row.pid) || row.pid <= 0 || row.pid === process.pid) {
      continue
    }
    if (commandLineTargetsWorktreeSetupRunner(row.command, trimmed, pathAnchors)) {
      targetPids.add(row.pid)
    }
  }

  if (targetPids.size === 0) {
    return 0
  }

  await Promise.all(
    [...targetPids].map((pid) =>
      killTree(pid).catch(() => {
        /* already dead or access denied — Git removal will surface leftovers */
      })
    )
  )
  return targetPids.size
}
