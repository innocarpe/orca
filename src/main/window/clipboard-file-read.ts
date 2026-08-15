import { fileURLToPath } from 'node:url'

export type ClipboardFileReadResult = { ok: true; filePaths: string[] }

// Injected so the platform branching is unit-testable without the real OS clipboard.
export type ClipboardFileReadDeps = {
  platform: NodeJS.Platform
  desktop?: string
  readBuffer: (format: string) => Buffer
  runCommand: (command: string, args: string[]) => Promise<string>
}

const CLIPBOARD_FILE_LIST_MAX_BYTES = 64 * 1024

export async function readFilesFromClipboard(
  deps: ClipboardFileReadDeps
): Promise<ClipboardFileReadResult> {
  try {
    if (deps.platform === 'darwin') {
      return { ok: true, filePaths: readMacClipboardFiles(deps) }
    }
    if (deps.platform === 'win32') {
      return { ok: true, filePaths: readWindowsClipboardFiles(deps) }
    }
    return { ok: true, filePaths: await readLinuxClipboardFiles(deps) }
  } catch {
    return { ok: true, filePaths: [] }
  }
}

function readMacClipboardFiles(deps: ClipboardFileReadDeps): string[] {
  return parseFileUrls(readClipboardText(deps, 'public.file-url'))
}

function readWindowsClipboardFiles(deps: ClipboardFileReadDeps): string[] {
  return decodeFileNameWList(safeReadBuffer(deps, 'FileNameW'))
}

async function readLinuxClipboardFiles(deps: ClipboardFileReadDeps): Promise<string[]> {
  const mimeTypes = /kde/i.test(deps.desktop ?? '')
    ? (['text/uri-list', 'x-special/gnome-copied-files'] as const)
    : (['x-special/gnome-copied-files', 'text/uri-list'] as const)

  for (const mime of mimeTypes) {
    const fromElectron = parseLinuxClipboardPayload(readClipboardText(deps, mime), mime)
    if (fromElectron.length > 0) {
      return fromElectron
    }
    for (const [command, args] of [
      ['wl-paste', ['--type', mime, '--no-newline']],
      ['xclip', ['-selection', 'clipboard', '-t', mime, '-o']]
    ] as const) {
      try {
        const paths = parseLinuxClipboardPayload(await deps.runCommand(command, [...args]), mime)
        if (paths.length > 0) {
          return paths
        }
      } catch {
        // try the next tool
      }
    }
  }
  return []
}

function parseLinuxClipboardPayload(payload: string, mime: string): string[] {
  const text = payload.replace(/\0+$/u, '')
  if (!text.trim()) {
    return []
  }
  if (mime === 'x-special/gnome-copied-files') {
    const lines = text.split(/\r?\n/u)
    // Why: the first line is the copy/cut verb; explorer paste always copies.
    return parseFileUrls(lines.slice(1).join('\n'))
  }
  return parseFileUrls(text)
}

function parseFileUrls(payload: string): string[] {
  const paths: string[] = []
  for (const rawLine of payload.split(/\r?\n/u)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }
    const filePath = decodeClipboardFileReference(line)
    if (filePath && !paths.includes(filePath)) {
      paths.push(filePath)
    }
  }
  return paths
}

function decodeClipboardFileReference(value: string): string | null {
  if (value.startsWith('file:')) {
    try {
      return usableClipboardPath(fileURLToPath(value))
    } catch {
      return null
    }
  }
  return usableClipboardPath(value)
}

function decodeFileNameWList(value: Buffer): string[] {
  if (
    value.byteLength < 2 ||
    value.byteLength > CLIPBOARD_FILE_LIST_MAX_BYTES ||
    value.byteLength % 2 !== 0
  ) {
    return []
  }
  const paths: string[] = []
  let offset = 0
  while (offset + 2 <= value.byteLength) {
    let end = offset
    while (end + 2 <= value.byteLength && value.readUInt16LE(end) !== 0) {
      end += 2
    }
    if (end === offset) {
      break
    }
    const filePath = usableClipboardPath(value.subarray(offset, end).toString('utf16le'))
    if (filePath && !paths.includes(filePath)) {
      paths.push(filePath)
    }
    offset = end + 2
  }
  return paths
}

function usableClipboardPath(filePath: string): string | null {
  if (!filePath || filePath.includes('\0')) {
    return null
  }
  if (filePath.startsWith('/') || isFullyQualifiedWindowsPath(filePath)) {
    return filePath
  }
  return null
}

function isFullyQualifiedWindowsPath(filePath: string): boolean {
  if (/^[A-Za-z]:[\\/]/.test(filePath)) {
    return true
  }
  if (/^\\\\\?\\[A-Za-z]:\\/.test(filePath)) {
    return true
  }
  const extendedUnc = /^\\\\\?\\UNC\\[^\\/]+\\([^\\/]+)(?:\\|$)/i.exec(filePath)
  if (extendedUnc) {
    return isOrdinaryUncShare(extendedUnc[1])
  }
  const unc = /^[/\\]{2}(?![?.][/\\])[^/\\]+[/\\]([^/\\]+)(?:[/\\]|$)/.exec(filePath)
  return isOrdinaryUncShare(unc?.[1])
}

function isOrdinaryUncShare(share: string | undefined): boolean {
  return typeof share === 'string' && share.toLowerCase() !== 'pipe'
}

function readClipboardText(deps: ClipboardFileReadDeps, format: string): string {
  return stripTrailingNulls(safeReadBuffer(deps, format).toString('utf8'))
}

function safeReadBuffer(deps: ClipboardFileReadDeps, format: string): Buffer {
  try {
    const value = deps.readBuffer(format)
    if (!Buffer.isBuffer(value) || value.byteLength > CLIPBOARD_FILE_LIST_MAX_BYTES) {
      return Buffer.alloc(0)
    }
    return value
  } catch {
    return Buffer.alloc(0)
  }
}

function stripTrailingNulls(value: string): string {
  return value.replace(/\0+$/u, '')
}
