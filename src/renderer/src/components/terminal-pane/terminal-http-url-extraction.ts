import { TERMINAL_HTTP_URL_MAX_LENGTH } from './terminal-http-link-limits'
import { isHttpUrlBodyTerminator, isHttpUrlTrailingPunctuation } from './terminal-http-url-boundary'

type ParsedTerminalHttpLink = {
  url: string
  startIndex: number
  endIndex: number
}

const HTTP_SCHEME_PREFIXES = ['https://', 'http://'] as const

export function extractTerminalHttpLinks(lineText: string): ParsedTerminalHttpLink[] {
  const links: ParsedTerminalHttpLink[] = []
  for (const candidate of iterateTerminalHttpUrlCandidates(lineText)) {
    let parsed: URL
    try {
      parsed = new URL(candidate.url)
    } catch {
      continue
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      continue
    }
    links.push({
      url: parsed.toString(),
      startIndex: candidate.startIndex,
      endIndex: candidate.endIndex
    })
  }
  return links
}

function* iterateTerminalHttpUrlCandidates(
  lineText: string
): Generator<{ url: string; startIndex: number; endIndex: number }> {
  let searchStart = 0
  while (searchStart < lineText.length) {
    const startIndex = findNextHttpSchemeIndex(lineText, searchStart)
    if (startIndex === -1) {
      return
    }

    if (!hasHttpUrlWordBoundary(lineText, startIndex)) {
      searchStart = startIndex + 1
      continue
    }

    const rawEndIndex = findHttpUrlCandidateEnd(lineText, startIndex)
    const endIndex = trimHttpUrlTrailingPunctuation(lineText, startIndex, rawEndIndex)
    searchStart = Math.max(rawEndIndex, startIndex + 1)
    if (endIndex <= startIndex || rawEndIndex - startIndex > TERMINAL_HTTP_URL_MAX_LENGTH) {
      continue
    }

    yield {
      url: lineText.slice(startIndex, endIndex),
      startIndex,
      endIndex
    }
  }
}

function findNextHttpSchemeIndex(lineText: string, searchStart: number): number {
  let nextIndex = -1
  for (const prefix of HTTP_SCHEME_PREFIXES) {
    const candidateIndex = lineText.indexOf(prefix, searchStart)
    if (candidateIndex !== -1 && (nextIndex === -1 || candidateIndex < nextIndex)) {
      nextIndex = candidateIndex
    }
  }
  return nextIndex
}

function hasHttpUrlWordBoundary(lineText: string, startIndex: number): boolean {
  return startIndex === 0 || !isAsciiWordCode(lineText.charCodeAt(startIndex - 1))
}

function findHttpUrlCandidateEnd(lineText: string, startIndex: number): number {
  const scanEnd = Math.min(lineText.length, startIndex + TERMINAL_HTTP_URL_MAX_LENGTH + 1)
  for (let index = startIndex; index < scanEnd; index += 1) {
    if (isHttpUrlBodyTerminator(lineText.charCodeAt(index))) {
      return index
    }
  }
  return scanEnd
}

function trimHttpUrlTrailingPunctuation(
  lineText: string,
  startIndex: number,
  rawEndIndex: number
): number {
  let endIndex = rawEndIndex
  while (endIndex > startIndex && isHttpUrlTrailingPunctuation(lineText.charCodeAt(endIndex - 1))) {
    endIndex -= 1
  }
  return endIndex
}

function isAsciiWordCode(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    code === 95 ||
    (code >= 97 && code <= 122)
  )
}
