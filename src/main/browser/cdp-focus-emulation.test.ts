import { describe, expect, it, vi } from 'vitest'
import { CDP_FOCUS_EMULATION_METHOD, enableCdpFocusEmulation } from './cdp-focus-emulation'

describe('enableCdpFocusEmulation', () => {
  it('enables Emulation.setFocusEmulationEnabled over CDP', async () => {
    const send = vi.fn(async () => ({}))

    await enableCdpFocusEmulation(send)

    expect(send).toHaveBeenCalledWith(CDP_FOCUS_EMULATION_METHOD, { enabled: true })
  })
})
