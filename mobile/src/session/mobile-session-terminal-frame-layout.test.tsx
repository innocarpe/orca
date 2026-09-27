import { createElement, type ReactNode } from 'react'
import { act, create } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

type LayoutEvent = { nativeEvent: { layout: { width: number; height: number } } }
type ViewProps = {
  children?: ReactNode
  onLayout?: (event: LayoutEvent) => void
  style?: { marginBottom?: number } | Array<{ marginBottom?: number } | false>
}

/**
 * react-native-web's rule, not React Native's: `useElementLayout` puts a View under its
 * ResizeObserver in a mount-only effect, so a View that gains `onLayout` after it mounted is never
 * observed and never reports. The double reports once, at mount, and only if it mounted with one.
 */
const { FRAME, WebView, platform } = await vi.hoisted(async () => {
  const react = await import('react')
  const frame = { width: 390, height: 600 }
  class View extends react.Component<ViewProps> {
    componentDidMount(): void {
      const styles = Array.isArray(this.props.style) ? this.props.style : [this.props.style]
      const marginBottom = styles.reduce(
        (total, style) => total + (style ? (style.marginBottom ?? 0) : 0),
        0
      )
      this.props.onLayout?.({
        nativeEvent: { layout: { ...frame, height: frame.height - marginBottom } }
      })
    }
    render(): ReactNode {
      return react.createElement('div', null, this.props.children)
    }
  }
  return { FRAME: frame, WebView: View, platform: { OS: 'ios' } }
})

vi.mock('react-native', () => ({
  Platform: platform,
  View: WebView,
  Text: WebView,
  Pressable: WebView,
  ActivityIndicator: WebView,
  Animated: { View: WebView },
  StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 1 }
}))
vi.mock('../storage/preferences', () => ({ saveTerminalTextScale: () => Promise.resolve() }))
vi.mock('../browser/MobileBrowserPane', () => ({ MobileBrowserPane: () => null }))
vi.mock('./TerminalPaneView', () => ({ TerminalPaneView: () => null }))
vi.mock('./MobileNativeChatOverlay', () => ({ MobileNativeChatOverlay: () => null }))
vi.mock('./MobileSessionFileReader', () => ({ FileReader: () => null }))
vi.mock('./MobileSessionMarkdownReader', () => ({ MarkdownReader: () => null }))
vi.mock('./mobile-session-styles', () => ({
  styles: { terminalFrame: { flex: 1 }, terminalBottomInset: { marginBottom: 16 } }
}))

import { MobileSessionActiveContent } from './MobileSessionActiveContent'

type Controller = Parameters<typeof MobileSessionActiveContent>[0]['controller']

function controller(
  showLoadingState: boolean,
  notifyTerminalFrameHeight: (height: number) => void
): Controller {
  const scope = {
    showLoadingState,
    showEmptyState: false,
    terminals: [],
    terminalFrameHeightRef: { current: 0 },
    setTerminalFrameWidth: () => {},
    notifyTerminalFrameHeight,
    dictation: { isRecording: false },
    nativeChatSendError: { message: null, clear: () => {} }
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the loading and terminal-frame branches read only these members; every other branch is off.
  return scope as unknown as Controller
}

describe('the terminal frame on the page', () => {
  afterEach(() => {
    platform.OS = 'ios'
  })

  it('reports its height when the session opens from the loading state', () => {
    const heights: number[] = []
    const notify = (height: number): void => {
      heights.push(height)
    }
    let renderer: ReturnType<typeof create> | undefined
    act(() => {
      renderer = create(
        createElement(MobileSessionActiveContent, { controller: controller(true, notify) })
      )
    })
    act(() => {
      renderer?.update(
        createElement(MobileSessionActiveContent, { controller: controller(false, notify) })
      )
    })
    expect(heights).toEqual([FRAME.height - 16])
  })

  it('reserves an iOS pixel gap outside the terminal viewport', () => {
    let renderer: ReturnType<typeof create> | undefined
    act(() => {
      renderer = create(
        createElement(MobileSessionActiveContent, {
          controller: controller(false, () => {})
        })
      )
    })
    const frame = renderer?.root.findAllByType(WebView).find((view) => view.props.onLayout)
    expect(frame?.props.style).toContainEqual({ marginBottom: 16 })
  })

  it('keeps the existing full viewport on Android', () => {
    platform.OS = 'android'
    const heights: number[] = []
    act(() => {
      create(
        createElement(MobileSessionActiveContent, {
          controller: controller(false, (height) => heights.push(height))
        })
      )
    })
    expect(heights).toEqual([FRAME.height])
  })
})
