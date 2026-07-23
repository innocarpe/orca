import { isAbsolute } from 'node:path'
import { isMarkdownDocumentName } from '../ipc/markdown-documents'

/** True for Electron/Chromium switches that must never be treated as file paths. */
function isElectronArgvSwitch(arg: string): boolean {
  return arg.startsWith('-') || arg.startsWith('--')
}

/**
 * Collect absolute markdown paths from a process argv / second-instance commandLine.
 * Skips the electron binary, script entry, and chromium switches.
 */
export function extractMarkdownPathsFromArgv(
  argv: readonly string[],
  options: { platform?: NodeJS.Platform } = {}
): string[] {
  const platform = options.platform ?? process.platform
  const seen = new Set<string>()
  const paths: string[] = []

  for (const raw of argv) {
    if (!raw || isElectronArgvSwitch(raw)) {
      continue
    }
    // Why: electron packaging puts the app path / asar path early in argv; those are not open targets.
    if (raw.endsWith('.asar') || raw.endsWith('electron') || raw.endsWith('Electron')) {
      continue
    }
    if (raw.includes('node_modules') && raw.includes('electron')) {
      continue
    }
    // Why: relative argv entries are ambiguous for OS "Open With"; require absolute paths.
    if (!isAbsolute(raw) && !(platform === 'win32' && /^[A-Za-z]:[\\/]/.test(raw))) {
      continue
    }
    if (!isMarkdownDocumentName(raw)) {
      continue
    }
    const key = platform === 'win32' ? raw.toLowerCase() : raw
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    paths.push(raw)
  }
  return paths
}

export function mergeMarkdownOpenPaths(
  existing: readonly string[],
  incoming: readonly string[],
  options: { platform?: NodeJS.Platform } = {}
): string[] {
  return extractMarkdownPathsFromArgv([...existing, ...incoming], options)
}
