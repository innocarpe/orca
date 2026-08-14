/**
 * @vitest-environment happy-dom
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyWindowBlurRootClass, WINDOW_BLUR_ROOT_CLASS } from './window-blur-root-class'

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8')
}

describe('window blur root class (#8797)', () => {
  it('toggles the root class only on the desktop shell', () => {
    const root = document.documentElement

    applyWindowBlurRootClass(root, true, true)
    expect(root.classList.contains(WINDOW_BLUR_ROOT_CLASS)).toBe(true)

    applyWindowBlurRootClass(root, true, false)
    expect(root.classList.contains(WINDOW_BLUR_ROOT_CLASS)).toBe(false)

    applyWindowBlurRootClass(root, false, true)
    expect(root.classList.contains(WINDOW_BLUR_ROOT_CLASS)).toBe(false)
  })

  it('clears the desktop app root fill so the platform blur material shows through', () => {
    expect(readSource('src/renderer/src/assets/main.css')).toMatch(
      /html\.window-blur,\s*html\.window-blur body,\s*html\.window-blur #root,\s*html\.window-blur \.app-layout\s*\{\s*background: transparent;\s*\}/
    )
  })

  it('drives the class from windowBackgroundBlur in document appearance and skips the paired web client', () => {
    const appearanceSource = readSource('src/renderer/src/app-shell/use-document-appearance.ts')

    expect(appearanceSource).toMatch(
      /applyWindowBlurRootClass\(\s*document\.documentElement,\s*settings\?\.windowBackgroundBlur \?\? false,\s*!isPairedWebClientWindow\(\)\s*\)/
    )
    expect(appearanceSource).toContain('}, [settings?.windowBackgroundBlur])')
  })
})
