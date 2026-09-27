// Why: the product name is its own final segment. A Claude task that only
// mentions DeepSeek Build does not end on that segment.
const DSB_TITLE_RE = /(?:^| - )deepseek build$/i

export function isDeepSeekBuildTerminalTitle(title: string): boolean {
  return DSB_TITLE_RE.test(title.trim())
}
