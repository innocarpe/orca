/**
 * CDP focus emulation so `document.hasFocus()` reports true even when the
 * guest WebContents is not the OS first responder (Electron 43+ / multi-view).
 *
 * Required for rich editors (Draft.js, etc.) that gate Input.insertText and
 * execCommand on frame focus — see #10375 / regression of #7035.
 */
export const CDP_FOCUS_EMULATION_METHOD = 'Emulation.setFocusEmulationEnabled' as const

export type CdpFocusEmulationSender = (
  method: string,
  params?: Record<string, unknown>
) => Promise<unknown>

export async function enableCdpFocusEmulation(send: CdpFocusEmulationSender): Promise<void> {
  await send(CDP_FOCUS_EMULATION_METHOD, { enabled: true })
}
