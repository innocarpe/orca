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

  it('splits `--flag=value` CLI form, which getServeOptions cannot read', () => {
    expect(
      normalizeServeModeArgv(['/AppRun', 'serve', '--port=9090', '--pairing-address=0.0.0.0'])
    ).toEqual(['/AppRun', '--serve', '--serve-port', '9090', '--serve-pairing-address', '0.0.0.0'])
  })

  it('translates serve flags in the mixed `--serve --port` form', () => {
    // Why: leaving these untranslated silently kept pairing enabled despite --no-pairing.
    expect(normalizeServeModeArgv(['orca', '--serve', '--port', '9090', '--no-pairing'])).toEqual([
      'orca',
      '--serve',
      '--serve-port',
      '9090',
      '--serve-no-pairing'
    ])
  })

  it('leaves a non-serve launch untouched', () => {
    const argv = ['orca', '--no-sandbox', '/home/u/project']
    expect(argvRequestsServeMode(argv)).toBe(false)
    expect(normalizeServeModeArgv(argv)).toEqual(argv)
  })

  it('does not splice prototype members onto argv for stray positionals', () => {
    expect(normalizeServeModeArgv(['/AppRun', 'serve', 'toString'])).toEqual([
      '/AppRun',
      '--serve',
      'toString'
    ])
  })

  it('passes args after `--` through verbatim', () => {
    expect(normalizeServeModeArgv(['/AppRun', 'serve', '--json', '--', '--port', '1'])).toEqual([
      '/AppRun',
      '--serve',
      '--serve-json',
      '--',
      '--port',
      '1'
    ])
  })
})
