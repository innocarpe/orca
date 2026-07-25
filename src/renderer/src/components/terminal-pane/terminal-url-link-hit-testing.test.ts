import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  extractTerminalHttpLinks,
  TERMINAL_HTTP_URL_MAX_LENGTH
} from './terminal-url-link-hit-testing'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('extractTerminalHttpLinks', () => {
  it('extracts regular http links and trims terminal trailing punctuation', () => {
    const line = 'open https://example.com/path?x=1.'

    expect(extractTerminalHttpLinks(line)).toEqual([
      {
        url: 'https://example.com/path?x=1',
        startIndex: 'open '.length,
        endIndex: line.length - 1
      }
    ])
  })

  it('requires a word boundary before the http scheme', () => {
    expect(extractTerminalHttpLinks('prefixhttps://example.com/path')).toEqual([])
    expect(extractTerminalHttpLinks('prefix https://example.com/path')).toHaveLength(1)
  })

  it('rejects overlong pasted URL candidates before URL parsing', () => {
    const overlongUrl = `https://example.com/${'a'.repeat(TERMINAL_HTTP_URL_MAX_LENGTH)}`

    expect(extractTerminalHttpLinks(overlongUrl)).toEqual([])
  })

  it('scans large pasted terminal lines without regex match iteration', () => {
    const matchAllSpy = vi.spyOn(String.prototype, 'matchAll')
    const pastedPrefix = 'pasted terminal noise '.repeat(10_000)
    const line = `${pastedPrefix}https://example.com/docs?q=orca.`

    expect(extractTerminalHttpLinks(line)).toEqual([
      {
        url: 'https://example.com/docs?q=orca',
        startIndex: pastedPrefix.length,
        endIndex: line.length - 1
      }
    ])
    expect(matchAllSpy).not.toHaveBeenCalled()
  })

  it('terminates URLs on fullwidth parentheses without swallowing CJK annotation text', () => {
    // Why (#10571): Claude Code often prints Japanese annotations glued to PRs.
    const line = 'PR: https://github.com/stablyai/orca/pull/12345（作成済み・マージ待ち）'
    const url = 'https://github.com/stablyai/orca/pull/12345'
    expect(extractTerminalHttpLinks(line)).toEqual([
      {
        url,
        startIndex: 'PR: '.length,
        endIndex: 'PR: '.length + url.length
      }
    ])
  })

  it('terminates URLs on CJK corner brackets and ideographic space', () => {
    expect(extractTerminalHttpLinks('詳細は「https://example.com/docs」を参照')).toEqual([
      {
        url: 'https://example.com/docs',
        startIndex: '詳細は「'.length,
        endIndex: '詳細は「https://example.com/docs'.length
      }
    ])

    const ideographicSpaceLine = 'PR: https://example.com/pull/2　（全角スペース区切り）'
    const url = 'https://example.com/pull/2'
    expect(extractTerminalHttpLinks(ideographicSpaceLine)).toEqual([
      {
        url,
        startIndex: 'PR: '.length,
        endIndex: 'PR: '.length + url.length
      }
    ])
  })

  it('still terminates on half-width spaces and parentheses next to CJK text', () => {
    const spaced = 'PR: https://example.com/pull/2 （作成済み）'
    const paren = 'PR: https://example.com/pull/2 (作成済み)'
    const url = 'https://example.com/pull/2'
    expect(extractTerminalHttpLinks(spaced)[0]?.url).toBe(url)
    expect(extractTerminalHttpLinks(paren)[0]?.url).toBe(url)
  })
})
