import type { PdfScalePreference } from './pdf-scale-preference'

export type PdfViewSessionState = {
  scalePreference: PdfScalePreference
  scrollTop: number
  scrollLeft: number
}

// Why: tab hide/show unmounts PdfViewer; keep zoom+scroll for the open path in
// this app session so returning to the tab does not reset to page 1 (#10352).
const sessionByPath = new Map<string, PdfViewSessionState>()

export function getPdfViewSession(filePath: string): PdfViewSessionState | undefined {
  if (!filePath) {
    return undefined
  }
  return sessionByPath.get(filePath)
}

export function setPdfViewSession(
  filePath: string,
  next: Partial<PdfViewSessionState>
): PdfViewSessionState | undefined {
  if (!filePath) {
    return undefined
  }
  const previous = sessionByPath.get(filePath)
  const merged: PdfViewSessionState = {
    scalePreference: next.scalePreference ?? previous?.scalePreference ?? 'page-width',
    scrollTop: next.scrollTop ?? previous?.scrollTop ?? 0,
    scrollLeft: next.scrollLeft ?? previous?.scrollLeft ?? 0
  }
  sessionByPath.set(filePath, merged)
  return merged
}

/** @internal tests only */
export function _resetPdfViewSessionStateForTest(): void {
  sessionByPath.clear()
}
