import { describe, expect, it } from 'vitest'
import { extractMarkdownPathsFromArgv, mergeMarkdownOpenPaths } from './os-open-markdown-paths'

describe('extractMarkdownPathsFromArgv', () => {
  it('keeps absolute markdown paths and drops switches', () => {
    expect(
      extractMarkdownPathsFromArgv(
        [
          '/Applications/Orca.app/Contents/MacOS/Orca',
          '--allow-file-access-from-files',
          '/Users/dev/notes/readme.md',
          '/Users/dev/notes/guide.markdown',
          '/Users/dev/notes/app.tsx'
        ],
        { platform: 'darwin' }
      )
    ).toEqual(['/Users/dev/notes/readme.md', '/Users/dev/notes/guide.markdown'])
  })

  it('accepts Windows drive-letter markdown paths', () => {
    expect(
      extractMarkdownPathsFromArgv(
        ['C:\\Program Files\\Orca\\Orca.exe', 'C:\\Users\\dev\\todo.md', '--serve'],
        { platform: 'win32' }
      )
    ).toEqual(['C:\\Users\\dev\\todo.md'])
  })

  it('dedupes case-insensitively on Windows', () => {
    expect(
      extractMarkdownPathsFromArgv(['C:\\notes\\A.md', 'c:\\notes\\a.md'], { platform: 'win32' })
    ).toEqual(['C:\\notes\\A.md'])
  })

  it('ignores relative paths', () => {
    expect(
      extractMarkdownPathsFromArgv(['readme.md', './docs/a.md'], { platform: 'linux' })
    ).toEqual([])
  })
})

describe('mergeMarkdownOpenPaths', () => {
  it('appends new absolute markdown paths', () => {
    expect(
      mergeMarkdownOpenPaths(['/tmp/a.md'], ['/tmp/b.mdx', '/tmp/a.md'], { platform: 'linux' })
    ).toEqual(['/tmp/a.md', '/tmp/b.mdx'])
  })
})
