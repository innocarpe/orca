import { describe, expect, it, vi } from 'vitest'
import type { AttachBrowserPageWebviewArgs } from './attach-browser-page-webview'

const focusGroup = vi.hoisted(() => vi.fn())
const dismissAddressBarSuggestions = vi.hoisted(() => vi.fn())

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({
      unifiedTabsByWorktree: {
        'wt-1': [{ contentType: 'browser', entityId: 'workspace-1', groupId: 'group-9' }]
      },
      focusGroup
    })
  }
}))

vi.mock('./browser-page-webview-guest-session', () => ({
  createBrowserPageWebviewGuestSession: () => ({
    guestRecovery: {
      validateAfterResume: () => {},
      recoverRenderer: () => {},
      retryRecovery: () => {},
      dispose: () => {}
    },
    handleDidAttach: () => {},
    handleDomReady: () => {},
    handleGuestDestroyed: () => {}
  })
}))

vi.mock('./browser-page-webview-loading-handlers', () => ({
  createBrowserPageWebviewLoadingHandlers: () => ({
    handleDidStartLoading: () => {},
    handleDidStopLoading: () => {},
    handleFailLoad: () => {}
  })
}))

vi.mock('./browser-page-webview-navigation-handlers', () => ({
  createBrowserPageWebviewNavigationHandlers: () => ({
    handleDidStartNavigation: () => {},
    handleDidRedirectNavigation: () => {},
    handleFullDidNavigate: () => {},
    handleDidNavigateInPage: () => {},
    handleTitleUpdate: () => {},
    handleFaviconUpdate: () => {},
    handleAnnotationViewportMessage: () => {}
  })
}))

vi.mock('./browser-system-resume', () => ({
  subscribeBrowserSystemResume: () => () => {}
}))

vi.mock('./browser-page-viewport', () => ({
  parkBrowserPageViewport: () => {}
}))

vi.mock('./webview-registry', () => ({
  isBrowserPageRendererRecoveryPending: () => false,
  moveFocusToRendererBeforeWebviewDetach: () => {}
}))

type Listener = (event?: unknown) => void

function fakeWebview(): Electron.WebviewTag & {
  listeners: Map<string, Set<Listener>>
} {
  const listeners = new Map<string, Set<Listener>>()
  return {
    listeners,
    addEventListener(type: string, listener: Listener) {
      const bucket = listeners.get(type) ?? new Set()
      bucket.add(listener)
      listeners.set(type, bucket)
    },
    removeEventListener(type: string, listener: Listener) {
      listeners.get(type)?.delete(listener)
    }
  } as Electron.WebviewTag & { listeners: Map<string, Set<Listener>> }
}

describe('bindBrowserPageWebviewListeners guest focus', () => {
  it('focuses the workspace tab and removes that same callback on cleanup', async () => {
    const { bindBrowserPageWebviewListeners } =
      await import('./bind-browser-page-webview-listeners')
    const webview = fakeWebview()
    const cleanup = bindBrowserPageWebviewListeners({
      container: { removeEventListener: () => {} } as HTMLDivElement,
      webview,
      needsInitialNavigation: false,
      onContainerDragOver: () => {},
      onContainerDrop: () => {},
      dismissAddressBarSuggestions,
      args: {
        browserTabId: 'page-1',
        workspaceId: 'workspace-1',
        worktreeId: 'wt-1',
        isPaintableRef: { current: false },
        validateVisibleGuestRegistrationRef: { current: () => {} },
        retryGuestRecoveryRef: { current: () => {} },
        webviewRef: { current: null }
      } as AttachBrowserPageWebviewArgs
    })

    const focusListeners = webview.listeners.get('focus')
    expect(focusListeners?.size).toBe(1)
    focusListeners?.forEach((listener) => listener())
    expect(dismissAddressBarSuggestions).toHaveBeenCalledTimes(1)
    expect(focusGroup).toHaveBeenCalledWith('wt-1', 'group-9')

    cleanup()
    expect(webview.listeners.get('focus')?.size ?? 0).toBe(0)
  })
})
