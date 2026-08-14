/** Root class that drops the app's opaque fill so Windows acrylic behind the web contents can show (#8797). */
export const WINDOW_BLUR_ROOT_CLASS = 'window-blur'

export function applyWindowBlurRootClass(
  root: HTMLElement,
  enabled: boolean,
  isDesktopShell: boolean
): void {
  root.classList.toggle(WINDOW_BLUR_ROOT_CLASS, enabled && isDesktopShell)
}
