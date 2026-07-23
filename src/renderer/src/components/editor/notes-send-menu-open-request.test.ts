// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest'
import {
  markNotesSendMenuOpenAccepted,
  OPEN_NOTES_SEND_MENU_EVENT,
  requestOpenNotesSendMenu
} from './notes-send-menu-open-request'

describe('requestOpenNotesSendMenu', () => {
  it('returns false when no listener accepts', () => {
    expect(requestOpenNotesSendMenu({ worktreeId: 'wt-1' })).toBe(false)
  })

  it('returns true when a listener marks the request accepted', () => {
    const listener = vi.fn(() => {
      markNotesSendMenuOpenAccepted()
    })
    window.addEventListener(OPEN_NOTES_SEND_MENU_EVENT, listener)
    try {
      expect(requestOpenNotesSendMenu({ worktreeId: 'wt-1' })).toBe(true)
      expect(listener).toHaveBeenCalledOnce()
    } finally {
      window.removeEventListener(OPEN_NOTES_SEND_MENU_EVENT, listener)
    }
  })
})
