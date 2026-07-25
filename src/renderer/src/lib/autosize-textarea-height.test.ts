import { describe, expect, it } from 'vitest'
import { autosizeTextareaHeight } from './autosize-textarea-height'

describe('autosizeTextareaHeight', () => {
  it('sets height from scrollHeight after resetting to auto', () => {
    const calls: string[] = []
    const textarea = {
      style: {
        set height(value: string) {
          calls.push(value)
        },
        get height() {
          return calls.at(-1) ?? ''
        }
      },
      scrollHeight: 72
    } as HTMLTextAreaElement

    autosizeTextareaHeight(textarea)

    expect(calls).toEqual(['auto', '72px'])
  })
})
