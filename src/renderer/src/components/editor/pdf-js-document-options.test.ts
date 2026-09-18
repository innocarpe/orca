import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { buildPdfJsDocumentOptions } from './pdf-js-document-options'

const PDF_BYTES = new Uint8Array([1, 2, 3])

describe('pdf.js getDocument resource options', () => {
  it('passes packed CMaps, standard fonts, and wasm URLs relative to the document', () => {
    const getDocument = vi.fn()
    getDocument(buildPdfJsDocumentOptions(PDF_BYTES, 'https://orca.test/index.html'))

    expect(getDocument).toHaveBeenCalledTimes(1)
    const options = getDocument.mock.calls[0]?.[0]
    expect(options).not.toEqual({ data: PDF_BYTES })
    expect(options.data).toBe(PDF_BYTES)
    expect(options.cMapUrl.endsWith('cmaps/')).toBe(true)
    expect(options.cMapPacked).toBe(true)
    expect(options.standardFontDataUrl.endsWith('standard_fonts/')).toBe(true)
    expect(options.wasmUrl.endsWith('wasm/')).toBe(true)
    expect(options).toEqual({
      data: PDF_BYTES,
      cMapUrl: 'https://orca.test/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: 'https://orca.test/standard_fonts/',
      wasmUrl: 'https://orca.test/wasm/'
    })
  })

  it('keeps file:// and web-index documents resolving next to the HTML entry', () => {
    expect(
      buildPdfJsDocumentOptions(
        PDF_BYTES,
        'file:///Applications/Orca.app/Contents/Resources/out/renderer/index.html'
      )
    ).toMatchObject({
      cMapUrl: 'file:///Applications/Orca.app/Contents/Resources/out/renderer/cmaps/',
      standardFontDataUrl:
        'file:///Applications/Orca.app/Contents/Resources/out/renderer/standard_fonts/',
      wasmUrl: 'file:///Applications/Orca.app/Contents/Resources/out/renderer/wasm/'
    })

    expect(
      buildPdfJsDocumentOptions(PDF_BYTES, 'https://host.example/pair/web-index.html')
    ).toEqual({
      data: PDF_BYTES,
      cMapUrl: 'https://host.example/pair/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: 'https://host.example/pair/standard_fonts/',
      wasmUrl: 'https://host.example/pair/wasm/'
    })
  })

  it('PdfViewer passes those options to pdf.js getDocument', () => {
    const source = readFileSync(fileURLToPath(new URL('./PdfViewer.tsx', import.meta.url)), 'utf8')
    expect(source).toContain(
      'pdfjsLib.getDocument(buildPdfJsDocumentOptions(bytes, document.baseURI))'
    )
    expect(source).not.toMatch(/getDocument\(\s*\{\s*data:\s*bytes\s*\}\s*\)/)
  })
})
