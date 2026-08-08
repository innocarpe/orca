import { fileURLToPath } from 'node:url'

function decodeUtf8Buffer(buffer: Buffer): string {
  let value = buffer.toString('utf8')
  while (value.endsWith('\0')) {
    value = value.slice(0, -1)
  }
  return value.trim()
}

function decodeUtf16LePaths(buffer: Buffer): string[] {
  return buffer
    .toString('utf16le')
    .split('\0')
    .map((path) => path.trim())
    .filter(Boolean)
}

function fileUrlToPathOrNull(value: string): string | null {
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'file:') {
      return null
    }
    return fileURLToPath(url)
  } catch {
    return null
  }
}

function parseUriList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#') && line !== 'copy' && line !== 'cut')
    .map(fileUrlToPathOrNull)
    .filter((path): path is string => path !== null)
}

export function readClipboardFilePathsFromFormats(
  readBuffer: (format: string) => Buffer,
  platform: NodeJS.Platform
): string[] {
  const paths: string[] = []
  const addPaths = (next: string[]): void => {
    for (const path of next) {
      if (!paths.includes(path)) {
        paths.push(path)
      }
    }
  }

  if (platform === 'win32') {
    addPaths(decodeUtf16LePaths(readBuffer('FileNameW')))
  }

  addPaths(parseUriList(decodeUtf8Buffer(readBuffer('public.file-url'))))
  addPaths(parseUriList(decodeUtf8Buffer(readBuffer('text/uri-list'))))
  addPaths(parseUriList(decodeUtf8Buffer(readBuffer('x-special/gnome-copied-files'))))

  return paths
}
