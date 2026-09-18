import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type { Plugin } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'
import {
  copyPdfjsViewerAssetsToOutput,
  createPdfjsViewerAssetsPlugin,
  PDFJS_VIEWER_ASSET_DIR_NAMES,
  resolvePdfjsDistPackageRoot,
  resolvePdfjsViewerAssetPath
} from '../build-plugins/pdfjs-viewer-assets'

const temporaryRoots: string[] = []

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function createTempRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix))
  temporaryRoots.push(root)
  return root
}

function writeAsset(root: string, relativePath: string, contents: string): void {
  const targetPath = join(root, relativePath)
  mkdirSync(dirname(targetPath), { recursive: true })
  writeFileSync(targetPath, contents)
}

function createFakePdfjsDist(): string {
  const root = createTempRoot('orca-pdfjs-dist-')
  writeAsset(root, 'cmaps/Adobe-Japan1-UCS2.bcmap', 'cmap')
  writeAsset(root, 'standard_fonts/LiberationSans-Regular.otf', 'font')
  writeAsset(root, 'wasm/jbig2.wasm', 'wasm')
  return root
}

function runWriteBundle(plugin: Plugin, dir: string): void {
  const hook = plugin.writeBundle
  if (typeof hook !== 'function') {
    throw new Error('Expected writeBundle hook')
  }
  Reflect.apply(hook, { meta: { watchMode: false } }, [{ dir }, {}])
}

describe('pdf.js viewer asset paths', () => {
  it('resolves cmap, standard font, and wasm files under the package root', () => {
    const pdfjsDistRoot = '/tmp/pdfjs-dist'
    expect(resolvePdfjsViewerAssetPath(pdfjsDistRoot, '/cmaps/Adobe-Japan1-UCS2.bcmap')).toBe(
      resolve(pdfjsDistRoot, 'cmaps', 'Adobe-Japan1-UCS2.bcmap')
    )
    expect(
      resolvePdfjsViewerAssetPath(pdfjsDistRoot, '/standard_fonts/LiberationSans-Regular.otf?v=1')
    ).toBe(resolve(pdfjsDistRoot, 'standard_fonts', 'LiberationSans-Regular.otf'))
    expect(resolvePdfjsViewerAssetPath(pdfjsDistRoot, '/wasm/jbig2.wasm')).toBe(
      resolve(pdfjsDistRoot, 'wasm', 'jbig2.wasm')
    )
  })

  it('rejects path traversal and unknown directories', () => {
    const pdfjsDistRoot = '/tmp/pdfjs-dist'
    expect(resolvePdfjsViewerAssetPath(pdfjsDistRoot, '/cmaps/../package.json')).toBeNull()
    expect(resolvePdfjsViewerAssetPath(pdfjsDistRoot, '/cmaps/%2e%2e/package.json')).toBeNull()
    expect(resolvePdfjsViewerAssetPath(pdfjsDistRoot, '/cmaps/foo/../../package.json')).toBeNull()
    expect(resolvePdfjsViewerAssetPath(pdfjsDistRoot, '/cmaps/foo\\bar.bcmap')).toBeNull()
    expect(
      resolvePdfjsViewerAssetPath(pdfjsDistRoot, '/assets/cmaps/Adobe-Japan1-UCS2.bcmap')
    ).toBeNull()
    expect(resolvePdfjsViewerAssetPath(pdfjsDistRoot, '/cmaps/')).toBeNull()
  })

  it('copies the three pdfjs-dist directories into the renderer output', () => {
    const pdfjsDistRoot = createFakePdfjsDist()
    const outDir = createTempRoot('orca-pdfjs-out-')
    copyPdfjsViewerAssetsToOutput(pdfjsDistRoot, outDir)
    expect(readFileSync(join(outDir, 'cmaps', 'Adobe-Japan1-UCS2.bcmap'), 'utf8')).toBe('cmap')
    expect(readFileSync(join(outDir, 'standard_fonts', 'LiberationSans-Regular.otf'), 'utf8')).toBe(
      'font'
    )
    expect(readFileSync(join(outDir, 'wasm', 'jbig2.wasm'), 'utf8')).toBe('wasm')
  })

  it('writeBundle copies viewer assets into options.dir', () => {
    const pdfjsDistRoot = createFakePdfjsDist()
    const outDir = createTempRoot('orca-pdfjs-write-bundle-')
    runWriteBundle(createPdfjsViewerAssetsPlugin({ pdfjsDistRoot }), outDir)
    expect(readFileSync(join(outDir, 'cmaps', 'Adobe-Japan1-UCS2.bcmap'), 'utf8')).toBe('cmap')
  })

  it('pdfjs-dist still ships the directories the viewer URLs name', () => {
    const pdfjsDistRoot = resolvePdfjsDistPackageRoot()
    expect(PDFJS_VIEWER_ASSET_DIR_NAMES).toEqual(['cmaps', 'standard_fonts', 'wasm'])
    for (const dirName of PDFJS_VIEWER_ASSET_DIR_NAMES) {
      expect(existsSync(join(pdfjsDistRoot, dirName))).toBe(true)
    }
  })
})
