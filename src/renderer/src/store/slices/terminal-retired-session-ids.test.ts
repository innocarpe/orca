import { beforeEach, describe, expect, it } from 'vitest'
import {
  _resetTerminalRetiredSessionIdsForTest,
  isTerminalSessionRetired,
  markTerminalSessionRetired,
  markTerminalSessionsRetired
} from './terminal-retired-session-ids'

describe('terminal-retired-session-ids', () => {
  beforeEach(() => {
    _resetTerminalRetiredSessionIdsForTest()
  })

  it('marks a session as retired so it cannot reconnect', () => {
    expect(isTerminalSessionRetired('serve-dead')).toBe(false)
    markTerminalSessionRetired('serve-dead')
    expect(isTerminalSessionRetired('serve-dead')).toBe(true)
  })

  it('ignores empty session ids', () => {
    markTerminalSessionRetired(null)
    markTerminalSessionRetired(undefined)
    markTerminalSessionRetired('')
    expect(isTerminalSessionRetired('')).toBe(false)
  })

  it('marks multiple session ids', () => {
    markTerminalSessionsRetired(['a', 'b'])
    expect(isTerminalSessionRetired('a')).toBe(true)
    expect(isTerminalSessionRetired('b')).toBe(true)
  })
})
