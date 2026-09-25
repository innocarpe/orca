// Why: `dsb run` exits after one message. Bare `dsb` and `dsb agent` stay in the TUI.
export function isDsbHeadlessOneShotCommand(tokens: readonly string[]): boolean {
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (!token || token === '--') {
      return false
    }
    if (token.startsWith('-')) {
      continue
    }
    return token === 'run'
  }
  return false
}
