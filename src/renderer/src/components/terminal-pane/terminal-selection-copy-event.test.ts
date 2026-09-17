// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { installTerminalSelectionCopyHandler } from './terminal-selection-copy-event'

function makeTerminal(selection: string) {
  const element = document.createElement('div')
  return { element, getSelection: () => selection }
}

function dispatchCopy(element: HTMLElement) {
  const event = new Event('copy', { bubbles: true, cancelable: true })
  element.dispatchEvent(event)
  return event
}

describe('installTerminalSelectionCopyHandler', () => {
  it('writes a non-empty selection and prevents xterm from handling the copy', async () => {
    const terminal = makeTerminal('remote answer')
    const writeClipboardText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue()
    const downstream = vi.fn()
    installTerminalSelectionCopyHandler(terminal, writeClipboardText)
    terminal.element.addEventListener('copy', downstream)

    const event = dispatchCopy(terminal.element)
    await Promise.resolve()

    expect(event.defaultPrevented).toBe(true)
    expect(writeClipboardText).toHaveBeenCalledWith('remote answer')
    expect(downstream).not.toHaveBeenCalled()
  })

  it('leaves an empty selection to the native copy path', () => {
    const terminal = makeTerminal('')
    const writeClipboardText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue()

    const event = dispatchCopy(terminal.element)

    expect(event.defaultPrevented).toBe(false)
    expect(writeClipboardText).not.toHaveBeenCalled()
  })

  it('swallows clipboard write failures and stops intercepting after disposal', async () => {
    const terminal = makeTerminal('remote answer')
    const writeClipboardText = vi
      .fn<(text: string) => Promise<void>>()
      .mockRejectedValue(new Error('clipboard unavailable'))
    const disposable = installTerminalSelectionCopyHandler(terminal, writeClipboardText)

    dispatchCopy(terminal.element)
    await Promise.resolve()
    expect(writeClipboardText).toHaveBeenCalledOnce()

    disposable.dispose()
    const nextEvent = dispatchCopy(terminal.element)
    expect(nextEvent.defaultPrevented).toBe(false)
    expect(writeClipboardText).toHaveBeenCalledOnce()
  })
})
