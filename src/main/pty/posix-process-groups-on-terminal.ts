import { runProcessSync, type ProcessResult } from '../../shared/child-process/run-process'

const PROCESS_TABLE_TIMEOUT_MS = 1_000
const PROCESS_TABLE_MAX_BYTES = 1024 * 1024
// Same columns as the dialect probe. Explicit widths keep BusyBox from merging device numbers.
const ALL_PROCESS_ARGS = [
  '-e',
  '-o',
  'pid=PROCESS_ID,pgid=PROCESS_GID,tty=TERMINAL_DEVICE_NUMBER,stat=PROCESS_STATE'
]

let terminalSelectionUnsupported = false

export function resetPosixTerminalSelectionForTests(): void {
  terminalSelectionUnsupported = false
}

function processTableSpec(args: string[]) {
  return {
    program: 'ps',
    args,
    env: { ...process.env, LC_ALL: 'C' },
    timeoutMs: PROCESS_TABLE_TIMEOUT_MS,
    maxOutputBytes: PROCESS_TABLE_MAX_BYTES
  }
}

function readProcessTableResult(result: ProcessResult): string {
  if (result.code !== 0 || result.timedOut || result.outputTruncated) {
    throw new Error('PTY process table is unavailable')
  }
  return result.stdout
}

function rejectsTerminalSelector(result: ProcessResult): boolean {
  const rejectedOption =
    /^ps: (?:invalid|illegal|unrecognized) option(?: -- |: | )['"]?-?([pt])['"]?\s*$/m.exec(
      result.stderr ?? ''
    )?.[1]
  return (
    result.code !== null &&
    result.code !== 0 &&
    !result.signal &&
    !result.timedOut &&
    !result.outputTruncated &&
    rejectedOption === 't'
  )
}

function isSafeTerminalName(ptsName: string): boolean {
  return /^[\w./]{1,128}$/.test(ptsName) && !ptsName.startsWith('-')
}

function parseProcessGroupIds(output: string): number[] {
  const groups = new Set<number>()
  for (const line of output.split(/\r?\n/)) {
    const pgid = Number(line.trim())
    if (Number.isInteger(pgid) && pgid > 1) {
      groups.add(pgid)
    }
  }
  return [...groups]
}

function terminalNames(ptsName: string): Set<string> {
  const base = ptsName.slice(ptsName.lastIndexOf('/') + 1)
  return new Set([ptsName, base])
}

function groupsFromFullTable(ptsName: string): string {
  const table = readProcessTableResult(runProcessSync(processTableSpec(ALL_PROCESS_ARGS)))
  const names = terminalNames(ptsName)
  const groups: number[] = []
  for (const line of table.split(/\r?\n/)) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\S+)/.exec(line)
    if (!match || !names.has(match[3])) {
      continue
    }
    const pgid = Number(match[2])
    if (pgid > 1) {
      groups.push(pgid)
    }
  }
  return groups.join('\n')
}

function readGroupsOnTerminal(ptsName: string): string {
  if (terminalSelectionUnsupported) {
    return groupsFromFullTable(ptsName)
  }
  const selected = runProcessSync(processTableSpec(['-t', ptsName, '-o', 'pgid=']))
  if (!rejectsTerminalSelector(selected)) {
    return readProcessTableResult(selected)
  }
  terminalSelectionUnsupported = true
  return groupsFromFullTable(ptsName)
}

/** Groups still attached to this PTY. `null` means the table could not be read. */
export function readPosixProcessGroupsOnTerminal(
  ptsName: string,
  deps: { readProcessTable?: (ptsName: string) => string } = {}
): number[] | null {
  if (!isSafeTerminalName(ptsName)) {
    return null
  }
  try {
    const output = (deps.readProcessTable ?? readGroupsOnTerminal)(ptsName)
    return parseProcessGroupIds(output)
  } catch {
    return null
  }
}
