import { describe, expect, it, vi } from 'vitest'
import { buildHtml } from './MermaidDiagram'

vi.mock('react-native', () => ({
  ScrollView: 'ScrollView',
  StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 1 },
  Text: 'Text',
  View: 'View'
}))
vi.mock('react-native-webview', () => ({ WebView: 'WebView' }))

// The diagram source is untrusted (agent output, PR/chat content). It is embedded
// inside an inline <script>, so it must not be able to close that script element.
describe('buildHtml source escaping', () => {
  it('does not let a </script> payload break out of the inline script', () => {
    const payload = 'graph TD; A-->B</script><script>window.evil=1</script>'
    const countClosers = (html: string) => (html.match(/<\/script>/gi) ?? []).length
    // The payload's two </script> must add zero raw closers over a benign render —
    // they were neutralized to \u003c instead of closing our inline script.
    const benign = countClosers(buildHtml('graph TD; A-->B'))
    expect(countClosers(buildHtml(payload))).toBe(benign)
    expect(buildHtml(payload)).toContain('\\u003c/script')
  })

  it('escapes the U+2028/U+2029 line separators that would break the JS literal', () => {
    const payload = `a${String.fromCharCode(0x2028)}b${String.fromCharCode(0x2029)}c`
    const html = buildHtml(payload)
    expect(html).toContain('\\u2028')
    expect(html).toContain('\\u2029')
    expect(html.includes(String.fromCharCode(0x2028))).toBe(false)
    expect(html.includes(String.fromCharCode(0x2029))).toBe(false)
  })

  it('still round-trips ordinary source to the exact original string', () => {
    const payload = 'graph LR\n  A["node & <tag>"] --> B'
    const html = buildHtml(payload)
    const match = html.match(/\.textContent = (".*?");\n {4}mermaid\.initialize/s)
    expect(match).not.toBeNull()
    expect(JSON.parse(match![1]!)).toBe(payload)
  })
})
