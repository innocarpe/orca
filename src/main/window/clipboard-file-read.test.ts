import { describe, expect, it, vi } from 'vitest'
import { readFilesFromClipboard, type ClipboardFileReadDeps } from './clipboard-file-read'

function makeDeps(overrides: Partial<ClipboardFileReadDeps> = {}): ClipboardFileReadDeps {
  return {
    platform: 'darwin',
    desktop: undefined,
    readBuffer: vi.fn(() => Buffer.alloc(0)),
    runCommand: vi.fn(async () => ''),
    ...overrides
  }
}

describe('readFilesFromClipboard', () => {
  it('returns no files when the clipboard has no file payload', async () => {
    expect(await readFilesFromClipboard(makeDeps())).toEqual({ ok: true, filePaths: [] })
  })

  it('reads a public.file-url buffer on macOS', async () => {
    const result = await readFilesFromClipboard(
      makeDeps({
        platform: 'darwin',
        readBuffer: (format) =>
          format === 'public.file-url'
            ? Buffer.from('file:///repo/a%20b.png\0', 'utf8')
            : Buffer.alloc(0)
      })
    )
    expect(result).toEqual({ ok: true, filePaths: ['/repo/a b.png'] })
  })

  it('ignores non-file clipboard text on macOS', async () => {
    const result = await readFilesFromClipboard(
      makeDeps({
        platform: 'darwin',
        readBuffer: (format) =>
          format === 'public.file-url' ? Buffer.from('just some text', 'utf8') : Buffer.alloc(0)
      })
    )
    expect(result).toEqual({ ok: true, filePaths: [] })
  })

  it('reads FileNameW paths on Windows', async () => {
    const result = await readFilesFromClipboard(
      makeDeps({
        platform: 'win32',
        readBuffer: (format) =>
          format === 'FileNameW' ? Buffer.from('C:\\repo\\notes.txt\0', 'utf16le') : Buffer.alloc(0)
      })
    )
    expect(result).toEqual({ ok: true, filePaths: ['C:\\repo\\notes.txt'] })
  })

  it('reads the GNOME copied-files payload on non-KDE desktops', async () => {
    const runCommand = vi.fn(async (command: string, args: string[]) => {
      if (command === 'wl-paste' && args.includes('x-special/gnome-copied-files')) {
        return 'copy\nfile:///repo/a.png'
      }
      throw new Error('missing format')
    })
    expect(
      await readFilesFromClipboard(makeDeps({ platform: 'linux', desktop: 'GNOME', runCommand }))
    ).toEqual({ ok: true, filePaths: ['/repo/a.png'] })
  })

  it('reads the KDE text/uri-list payload first on a KDE desktop', async () => {
    const runCommand = vi.fn(async (command: string, args: string[]) => {
      if (command === 'wl-paste' && args.includes('text/uri-list')) {
        return 'file:///repo/a%20b.png\r\n'
      }
      throw new Error('missing format')
    })
    expect(
      await readFilesFromClipboard(makeDeps({ platform: 'linux', desktop: 'KDE', runCommand }))
    ).toEqual({ ok: true, filePaths: ['/repo/a b.png'] })
  })

  it('prefers an Electron buffer over spawning a Linux clipboard tool', async () => {
    const runCommand = vi.fn(async () => {
      throw new Error('should not run')
    })
    expect(
      await readFilesFromClipboard(
        makeDeps({
          platform: 'linux',
          desktop: 'GNOME',
          readBuffer: (format) =>
            format === 'x-special/gnome-copied-files'
              ? Buffer.from('copy\nfile:///repo/from-electron.ts', 'utf8')
              : Buffer.alloc(0),
          runCommand
        })
      )
    ).toEqual({ ok: true, filePaths: ['/repo/from-electron.ts'] })
    expect(runCommand).not.toHaveBeenCalled()
  })

  it('returns no files when every Linux clipboard tool is unavailable', async () => {
    const runCommand = vi.fn(async () => {
      throw new Error('command not found')
    })
    expect(await readFilesFromClipboard(makeDeps({ platform: 'linux', runCommand }))).toEqual({
      ok: true,
      filePaths: []
    })
  })

  it('does not treat a clipboard read throw as a hard failure', async () => {
    expect(
      await readFilesFromClipboard(
        makeDeps({
          readBuffer: () => {
            throw new Error('clipboard unavailable')
          }
        })
      )
    ).toEqual({ ok: true, filePaths: [] })
  })
})
