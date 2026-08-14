import { useEffect } from 'react'
import { buildAppFontFamily } from '@/lib/app-font-family'
import { isPairedWebClientWindow } from '@/lib/desktop-window-chrome'
import { applyWindowBlurRootClass } from '@/lib/window-blur-root-class'
import { applyDocumentTheme } from '../lib/document-theme'
import { scheduleRuntimeGraphSync } from '../runtime/sync-runtime-graph'
import { useAppStore } from '../store'

/** Applies the settings-driven theme and app font to the document root. */
export function useDocumentAppearance(): void {
  const settings = useAppStore((s) => s.settings)

  useEffect(() => {
    if (!settings) {
      return
    }

    if (settings.theme === 'dark') {
      applyDocumentTheme('dark')
      return undefined
    } else if (settings.theme === 'light') {
      applyDocumentTheme('light')
      return undefined
    }
    // system
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    applyDocumentTheme('system')
    const handler = (): void => {
      applyDocumentTheme('system')
      // System theme changes don't mutate the store, so mobile terminal colors need an explicit graph republish.
      scheduleRuntimeGraphSync()
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [settings])

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--app-font-family',
      buildAppFontFamily(settings?.appFontFamily)
    )
  }, [settings?.appFontFamily])

  // Why: acrylic sits behind the web contents; an opaque app root hides it (#8797).
  useEffect(() => {
    applyWindowBlurRootClass(
      document.documentElement,
      settings?.windowBackgroundBlur ?? false,
      !isPairedWebClientWindow()
    )
  }, [settings?.windowBackgroundBlur])
}
