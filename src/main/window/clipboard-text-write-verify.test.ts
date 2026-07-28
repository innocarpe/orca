import { beforeEach, describe, expect, it, vi } from 'vitest'

const { clipboardReadTextMock, clipboardWriteTextMock } = vi.hoisted(() => ({
  clipboardReadTextMock: vi.fn(),
  clipboardWriteTextMock: vi.fn()
}))

vi.mock('electron', () => ({
  clipboard: {
    readText: clipboardReadTextMock,
    writeText: clipboardWriteTextMock
  }
}))

import { writeClipboardTextAndVerify } from './clipboard-text-write-verify'

describe('writeClipboardTextAndVerify', () => {
  beforeEach(() => {
    clipboardReadTextMock.mockReset()
    clipboardWriteTextMock.mockReset()
  })

  it('writes then accepts a matching standard clipboard read-back', () => {
    clipboardWriteTextMock.mockImplementation((text: string) => {
      clipboardReadTextMock.mockReturnValue(text)
    })

    expect(() => writeClipboardTextAndVerify('tui answer')).not.toThrow()
    expect(clipboardWriteTextMock).toHaveBeenCalledWith('tui answer')
    expect(clipboardReadTextMock).toHaveBeenCalledWith()
  })

  it('rejects standard text writes when the clipboard read-back does not match', () => {
    clipboardReadTextMock.mockReturnValue('old clipboard')

    expect(() => writeClipboardTextAndVerify('tui answer')).toThrow(
      'Clipboard write verification failed'
    )
    expect(clipboardWriteTextMock).toHaveBeenCalledWith('tui answer')
  })
})
