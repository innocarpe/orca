import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MobileMarkdown } from './MobileMarkdown'

vi.mock('react-native', () => ({
  Linking: { openURL: vi.fn() },
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: { create: <T>(styles: T) => styles, hairlineWidth: 1 },
  Text: 'Text',
  View: 'View'
}))
vi.mock('./pr-sidebar/MermaidDiagram', () => ({ MermaidDiagram: 'MermaidDiagram' }))

let renderer: ReactTestRenderer | undefined

afterEach(() => {
  renderer?.unmount()
  renderer = undefined
})

function render(content: string): ReactTestRenderer {
  act(() => {
    renderer = create(createElement(MobileMarkdown, { content }))
  })
  return renderer!
}

function mermaidCount(tree: ReactTestRenderer): number {
  return tree.root.findAllByType('MermaidDiagram' as never).length
}

describe('MobileMarkdown mermaid routing', () => {
  it('routes a closed mermaid fence to MermaidDiagram', () => {
    const tree = render('```mermaid\ngraph TD; A-->B\n```')
    expect(mermaidCount(tree)).toBe(1)
  })

  it('keeps a streaming (unterminated) mermaid fence as raw code', () => {
    const tree = render('```mermaid\ngraph TD; A-->B')
    expect(mermaidCount(tree)).toBe(0)
  })

  it('does not route other code fences to MermaidDiagram', () => {
    const tree = render('```ts\nconst a = 1\n```')
    expect(mermaidCount(tree)).toBe(0)
  })
})
