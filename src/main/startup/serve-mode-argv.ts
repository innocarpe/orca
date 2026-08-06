/**
 * Detect and normalize headless-serve argv for both Electron flags (`--serve`)
 * and CLI-form subcommands (`serve --port …`) that land on the main process
 * when the AppImage/CLI redirect did not rewrite them.
 */

const SERVE_FLAG = '--serve'

const CLI_TO_SERVE_FLAG: Record<string, string> = {
  '--json': '--serve-json',
  '--no-pairing': '--serve-no-pairing',
  '--mobile-pairing': '--serve-mobile-pairing',
  '--recipe-json': '--serve-recipe-json'
}

const CLI_TO_SERVE_VALUE_FLAG: Record<string, string> = {
  '--port': '--serve-port',
  '--pairing-address': '--serve-pairing-address',
  '--project-root': '--serve-project-root'
}

function isFlagToken(token: string | undefined): boolean {
  return Boolean(token && token.startsWith('-'))
}

/** True when argv already has `--serve` or a bare `serve` subcommand. */
export function argvRequestsServeMode(argv: readonly string[]): boolean {
  if (argv.includes(SERVE_FLAG)) {
    return true
  }
  // Skip executable path; treat a bare `serve` token that is not a flag value as the subcommand.
  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === 'serve') {
      const prev = argv[i - 1]
      // Value of a previous flag would be `serve` only for weird paths; still accept.
      if (
        prev === undefined ||
        isFlagToken(prev) ||
        prev.endsWith('.js') ||
        prev.endsWith('.mjs')
      ) {
        return true
      }
      // Previous token was a non-flag path (e.g. AppRun); still a subcommand.
      return true
    }
  }
  return false
}

/**
 * Rewrite CLI-form `serve` invocations into the `--serve*` flag shape that
 * `getServeOptions` already understands. Idempotent when already in flag form.
 */
export function normalizeServeModeArgv(argv: readonly string[]): string[] {
  if (argv.includes(SERVE_FLAG)) {
    return [...argv]
  }
  const serveIndex = argv.findIndex((token, index) => index > 0 && token === 'serve')
  if (serveIndex === -1) {
    return [...argv]
  }

  const next = [...argv.slice(0, serveIndex), SERVE_FLAG]
  for (let i = serveIndex + 1; i < argv.length; i += 1) {
    const token = argv[i]
    if (token in CLI_TO_SERVE_FLAG) {
      next.push(CLI_TO_SERVE_FLAG[token]!)
      continue
    }
    if (token in CLI_TO_SERVE_VALUE_FLAG) {
      next.push(CLI_TO_SERVE_VALUE_FLAG[token]!)
      const value = argv[i + 1]
      if (value !== undefined && !isFlagToken(value)) {
        next.push(value)
        i += 1
      }
      continue
    }
    // Already-normalized --serve-* or unrelated Electron flags pass through.
    next.push(token)
  }
  return next
}
