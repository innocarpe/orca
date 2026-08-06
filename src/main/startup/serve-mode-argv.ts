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

/** Flags that consume the next argv token as a value (CLI-form + Electron passthrough). */
const VALUE_TAKING_FLAGS = new Set([
  ...Object.keys(CLI_TO_SERVE_VALUE_FLAG),
  '--serve-port',
  '--serve-pairing-address',
  '--serve-project-root',
  '--config',
  '--user-data-dir',
  '--environment',
  '--pairing-code'
])

function isFlagToken(token: string | undefined): boolean {
  return Boolean(token && token.startsWith('-'))
}

/**
 * Index of the CLI `serve` subcommand: the first positional token after flags
 * (and their values). Option *values* named `serve` are never treated as the
 * subcommand.
 */
export function findServeSubcommandIndex(argv: readonly string[]): number {
  let i = 1
  while (i < argv.length) {
    const token = argv[i]
    if (token === '--') {
      return -1
    }
    if (isFlagToken(token)) {
      const eq = token!.indexOf('=')
      if (eq !== -1) {
        i += 1
        continue
      }
      if (VALUE_TAKING_FLAGS.has(token!)) {
        i += 2
        continue
      }
      i += 1
      continue
    }
    return token === 'serve' ? i : -1
  }
  return -1
}

/** True when argv already has `--serve` or a bare `serve` CLI subcommand. */
export function argvRequestsServeMode(argv: readonly string[]): boolean {
  return argv.includes(SERVE_FLAG) || findServeSubcommandIndex(argv) !== -1
}

/**
 * Rewrite CLI-form `serve` invocations into the `--serve*` flag shape that
 * `getServeOptions` already understands. Idempotent when already in flag form.
 */
export function normalizeServeModeArgv(argv: readonly string[]): string[] {
  if (argv.includes(SERVE_FLAG)) {
    return [...argv]
  }
  const serveIndex = findServeSubcommandIndex(argv)
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
    next.push(token)
  }
  return next
}
