import { describe, expect, it } from 'vitest'
import { formatDropUploadFailureDescription } from './drop-upload-failure-description'

describe('formatDropUploadFailureDescription', () => {
  it('shows the filename and reason without exposing the source path', () => {
    expect(
      formatDropUploadFailureDescription([
        { sourcePath: '/secret/project/file.txt', reason: 'File is too large' }
      ])
    ).toBe('file.txt: File is too large')
  })

  it('limits long failure lists while preserving the remaining count', () => {
    expect(
      formatDropUploadFailureDescription([
        { sourcePath: '/tmp/one.txt', reason: 'disk full' },
        { sourcePath: '/tmp/two.txt', reason: 'permission denied' },
        { sourcePath: '/tmp/three.txt', reason: 'timed out' }
      ])
    ).toBe('one.txt: disk full\ntwo.txt: permission denied\n+1 more failure')
  })
})
