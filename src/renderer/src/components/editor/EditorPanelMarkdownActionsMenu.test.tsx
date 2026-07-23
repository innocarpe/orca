import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorPanelMarkdownActionsMenu } from './EditorPanelMarkdownActionsMenu'

const checkboxItems = vi.hoisted(() => ({ list: [] as { checked?: boolean; label: string }[] }))

vi.mock('@/components/ui/dropdown-menu', async () => {
  const React_ = await import('react')
  const passthrough = ({ children }: { children?: React.ReactNode }) =>
    React_.createElement(React_.Fragment, null, children)
  return {
    DropdownMenu: passthrough,
    DropdownMenuContent: passthrough,
    DropdownMenuItem: passthrough,
    DropdownMenuSeparator: () => null,
    DropdownMenuTrigger: passthrough,
    DropdownMenuCheckboxItem: ({
      checked,
      children
    }: {
      checked?: boolean
      children?: React.ReactNode
    }) => {
      const label = React_.Children.toArray(children)
        .filter((child): child is string => typeof child === 'string')
        .join('')
      checkboxItems.list.push({ checked, label })
      return React_.createElement(React_.Fragment, null, children)
    }
  }
})

vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))

describe('EditorPanelMarkdownActionsMenu', () => {
  beforeEach(() => {
    checkboxItems.list = []
  })

  it('shows Word Wrap for normal file tabs using editorWordWrap (#9974)', () => {
    renderToStaticMarkup(
      React.createElement(EditorPanelMarkdownActionsMenu, {
        isMarkdown: false,
        isDiffSurface: false,
        diffWordWrap: false,
        editorWordWrap: true,
        shouldShowMarkdownExportAction: false,
        canExportMarkdownToPdf: false,
        canShowMarkdownFrontmatterToggle: false,
        markdownFrontmatterVisible: false,
        onToggleDiffWordWrap: () => {},
        onToggleEditorWordWrap: () => {},
        onToggleMarkdownFrontmatter: () => {},
        onExportMarkdownToPdf: () => {}
      })
    )

    expect(checkboxItems.list).toEqual([{ checked: true, label: 'Word Wrap' }])
  })

  it('binds Word Wrap to diffWordWrap on diff surfaces', () => {
    renderToStaticMarkup(
      React.createElement(EditorPanelMarkdownActionsMenu, {
        isMarkdown: false,
        isDiffSurface: true,
        diffWordWrap: true,
        editorWordWrap: false,
        shouldShowMarkdownExportAction: false,
        canExportMarkdownToPdf: false,
        canShowMarkdownFrontmatterToggle: false,
        markdownFrontmatterVisible: false,
        onToggleDiffWordWrap: () => {},
        onToggleEditorWordWrap: () => {},
        onToggleMarkdownFrontmatter: () => {},
        onExportMarkdownToPdf: () => {}
      })
    )

    expect(checkboxItems.list).toEqual([{ checked: true, label: 'Word Wrap' }])
  })
})
