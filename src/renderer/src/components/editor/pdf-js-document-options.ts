export type PdfJsDocumentOptions = {
  data: Uint8Array
  cMapUrl: string
  cMapPacked: true
  standardFontDataUrl: string
  wasmUrl: string
}

// Why: pdf.js loads Adobe-Japan1 CMaps and JBIG2/JPEG2000 WASM from these
// directories; `{ data }` alone leaves CJK text and scanned pages blank.
export function buildPdfJsDocumentOptions(
  data: Uint8Array,
  documentBaseUrl: string
): PdfJsDocumentOptions {
  return {
    data,
    cMapUrl: new URL('cmaps/', documentBaseUrl).href,
    cMapPacked: true,
    standardFontDataUrl: new URL('standard_fonts/', documentBaseUrl).href,
    wasmUrl: new URL('wasm/', documentBaseUrl).href
  }
}
