import { describe, expect, it } from 'vitest'
import {
  argvRequestsServeMode,
  findServeSubcommandIndex,
  normalizeServeModeArgv
} from './serve-mode-argv'

describe('serve-mode-argv', () => {
  it('detects --serve and bare serve subcommand', () => {
    expect(argvRequestsServeMode(['orca', '--serve'])).toBe(true)
    expect(argvRequestsServeMode(['/AppRun', 'serve'])).toBe(true)
    expect(argvRequestsServeMode(['/AppRun', '--no-sandbox', 'serve', '--port', '8080'])).toBe(true)
    expect(argvRequestsServeMode(['orca'])).toBe(false)
  })

  it('does not treat serve as a subcommand when it is an option value', () => {
    expect(findServeSubcommandIndex(['app', '--config', 'serve'])).toBe(-1)
    expect(argvRequestsServeMode(['app', '--config', 'serve'])).toBe(false)
    expect(normalizeServeModeArgv(['app', '--config', 'serve'])).toEqual([
      'app',
      '--config',
      'serve'
    ])
  })

  it('does not treat a later positional serve as the subcommand after another command', () => {
    expect(findServeSubcommandIndex(['app', 'status', 'serve'])).toBe(-1)
    expect(argvRequestsServeMode(['app', 'status', 'serve'])).toBe(false)
  })

  it('rewrites CLI-form serve flags into --serve* form', () => {
    expect(
      normalizeServeModeArgv([
        '/AppRun',
        'serve',
        '--port',
        '9090',
        '--json',
        '--pairing-address',
        '0.0.0.0',
        '--no-pairing'
      ])
    ).toEqual([
      '/AppRun',
      '--serve',
      '--serve-port',
      '9090',
      '--serve-json',
      '--serve-pairing-address',
      '0.0.0.0',
      '--serve-no-pairing'
    ])
  })

  it('leaves already-normalized argv unchanged', () => {
    const argv = ['orca', '--serve', '--serve-json']
    expect(normalizeServeModeArgv(argv)).toEqual(argv)
  })
})
