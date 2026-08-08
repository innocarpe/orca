import { describe, expect, it, vi } from 'vitest'
import { readClipboardFilePathsFromFormats } from './clipboard-file-read'

function reader(formats: Record<string, Buffer | string>): (format: string) => Buffer {
  return (format) => {
    const value = formats[format] ?? Buffer.alloc(0)
    return typeof value === 'string' ? Buffer.from(value, 'utf8') : value
  }
}

describe('readClipboardFilePathsFromFormats', () => {
  it('reads file URLs without treating plain clipboard text as files', () => {
    const paths = readClipboardFilePathsFromFormats(
      reader({
        'public.file-url': 'file:///Users/alice/project/logo%201.png'
      }),
      'darwin'
    )

    expect(paths).toEqual(['/Users/alice/project/logo 1.png'])
  })

  it('reads Linux copied-files and uri-list payloads with duplicate suppression', () => {
    const paths = readClipboardFilePathsFromFormats(
      reader({
        'x-special/gnome-copied-files': 'copy\nfile:///home/alice/a.txt\n',
        'text/uri-list': '# comment\nfile:///home/alice/a.txt\nfile:///home/alice/b.txt\n'
      }),
      'linux'
    )

    expect(paths).toEqual(['/home/alice/a.txt', '/home/alice/b.txt'])
  })

  it('reads Windows FileNameW paths', () => {
    const paths = readClipboardFilePathsFromFormats(
      reader({
        FileNameW: Buffer.from('C:\\Users\\alice\\Desktop\\note.txt\0', 'utf16le')
      }),
      'win32'
    )

    expect(paths).toEqual(['C:\\Users\\alice\\Desktop\\note.txt'])
  })

  it('returns an empty list for non-file clipboard formats', () => {
    const readBuffer = vi.fn((format: string) =>
      format === 'text/plain' ? Buffer.from('/tmp/not-a-file-import.txt') : Buffer.alloc(0)
    )

    const paths = readClipboardFilePathsFromFormats(readBuffer, 'linux')

    expect(paths).toEqual([])
    expect(readBuffer).not.toHaveBeenCalledWith('text/plain')
  })
})
