import { describe, expect, it } from 'vitest'
import { getAppImageCliArgs } from './appimage-cli-redirect'
import { argvRequestsServeMode, normalizeServeModeArgv } from './serve-mode-argv'

// Why: index.ts must run both CLI redirects before rewriting argv. Rewriting
// first replaces the `serve` positional with `--serve`, so the redirect's
// command-name lookup finds a port number instead of a command and bails —
// silently dropping AppImage serve launches out of the CLI path (#12677).

const REDIRECT_OPTIONS = {
  platform: 'linux' as const,
  isPackaged: true,
  commandNames: ['serve', 'status']
}
// A mounted AppImage is the case where the runtime does export these.
const MOUNTED_APPIMAGE_ENV = { APPIMAGE: '/opt/orca/Orca.AppImage', APPDIR: '/tmp/.mount_ab12' }

function rewriteAsIndexDoes(argv: string[]): string[] {
  return argvRequestsServeMode(argv) ? normalizeServeModeArgv(argv) : argv
}

describe('serve argv rewrite vs AppImage CLI redirect ordering', () => {
  const launchArgv = ['/opt/orca/orca-ide', '--no-sandbox', 'serve', '--port', '7777', '--json']

  it('hands the launch argv to the CLI when the redirect runs first', () => {
    expect(getAppImageCliArgs(launchArgv, MOUNTED_APPIMAGE_ENV, REDIRECT_OPTIONS)).toEqual([
      'serve',
      '--port',
      '7777',
      '--json'
    ])
  })

  it('loses the redirect if the rewrite runs first', () => {
    const rewritten = rewriteAsIndexDoes(launchArgv)
    expect(rewritten).toContain('--serve')
    expect(getAppImageCliArgs(rewritten, MOUNTED_APPIMAGE_ENV, REDIRECT_OPTIONS)).toBeNull()
  })

  it('leaves non-serve CLI commands redirectable either way', () => {
    const argv = ['/opt/orca/orca-ide', 'status']
    expect(rewriteAsIndexDoes(argv)).toEqual(argv)
    expect(getAppImageCliArgs(argv, MOUNTED_APPIMAGE_ENV, REDIRECT_OPTIONS)).toEqual(['status'])
  })
})
