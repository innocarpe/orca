import { createReadStream, cpSync, existsSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import type { Plugin } from 'vite'

export const PDFJS_VIEWER_ASSET_DIR_NAMES = ['cmaps', 'standard_fonts', 'wasm'] as const

type PdfjsViewerAssetDirName = (typeof PDFJS_VIEWER_ASSET_DIR_NAMES)[number]

export type PdfjsViewerAssetsPluginOptions = {
  pdfjsDistRoot?: string
}

function isPdfjsViewerAssetDirName(value: string): value is PdfjsViewerAssetDirName {
  for (const dirName of PDFJS_VIEWER_ASSET_DIR_NAMES) {
    if (dirName === value) {
      return true
    }
  }
  return false
}

export function resolvePdfjsDistPackageRoot(
  fromPath = join(process.cwd(), 'package.json')
): string {
  return dirname(createRequire(fromPath).resolve('pdfjs-dist/package.json'))
}

export function resolvePdfjsViewerAssetPath(
  pdfjsDistRoot: string,
  requestUrlPath: string
): string | null {
  const pathname = requestUrlPath.split('?')[0] ?? ''
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  if (decoded.includes('\0') || decoded.includes('\\')) {
    return null
  }
  const segments = decoded.split('/').filter((segment) => segment.length > 0)
  if (segments.length < 2) {
    return null
  }
  const [dirName, ...rest] = segments
  if (
    !isPdfjsViewerAssetDirName(dirName) ||
    rest.some((segment) => segment === '.' || segment === '..')
  ) {
    return null
  }
  const assetRoot = resolve(pdfjsDistRoot, dirName)
  const candidate = resolve(assetRoot, ...rest)
  const relativePath = relative(assetRoot, candidate)
  if (relativePath.length === 0 || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    return null
  }
  return candidate
}

export function copyPdfjsViewerAssetsToOutput(pdfjsDistRoot: string, outDir: string): void {
  for (const dirName of PDFJS_VIEWER_ASSET_DIR_NAMES) {
    const source = join(pdfjsDistRoot, dirName)
    if (!existsSync(source)) {
      throw new Error(`[pdfjs-viewer-assets] missing ${source}`)
    }
    cpSync(source, join(outDir, dirName), { recursive: true })
  }
}

function pdfjsViewerAssetContentType(filePath: string): string {
  if (extname(filePath).toLowerCase() === '.wasm') {
    return 'application/wasm'
  }
  return 'application/octet-stream'
}

function servePdfjsViewerAsset(
  pdfjsDistRoot: string,
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void
): void {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    next()
    return
  }
  const requestUrl = req.url
  if (typeof requestUrl !== 'string') {
    next()
    return
  }
  const filePath = resolvePdfjsViewerAssetPath(pdfjsDistRoot, requestUrl)
  if (filePath === null || !existsSync(filePath) || !statSync(filePath).isFile()) {
    next()
    return
  }
  res.statusCode = 200
  res.setHeader('Content-Type', pdfjsViewerAssetContentType(filePath))
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  const stream = createReadStream(filePath)
  stream.on('error', () => {
    if (!res.headersSent) {
      next()
      return
    }
    res.destroy()
  })
  stream.pipe(res)
}

export function createPdfjsViewerAssetsPlugin(
  options: PdfjsViewerAssetsPluginOptions = {}
): Plugin {
  const pdfjsDistRoot = options.pdfjsDistRoot ?? resolvePdfjsDistPackageRoot()
  return {
    name: 'pdfjs-viewer-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        servePdfjsViewerAsset(pdfjsDistRoot, req, res, next)
      })
    },
    writeBundle(outputOptions) {
      const outDir = outputOptions.dir
      if (typeof outDir !== 'string' || outDir.length === 0) {
        throw new Error('[pdfjs-viewer-assets] writeBundle is missing output dir')
      }
      copyPdfjsViewerAssetsToOutput(pdfjsDistRoot, outDir)
    }
  }
}
