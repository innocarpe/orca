import { describe, expect, it } from 'vitest'
import { getAgentResumeArgv } from './agent-session-resume'
import { isDsbHeadlessOneShotCommand } from './dsb-headless-command'

describe('DeepSeek Build launch shape', () => {
  it('treats run as a one-shot and leaves the TUI interactive', () => {
    expect(isDsbHeadlessOneShotCommand(['dsb', 'run', 'explain this'])).toBe(true)
    expect(isDsbHeadlessOneShotCommand(['dsb', '--dogfood'])).toBe(false)
    expect(isDsbHeadlessOneShotCommand(['dsb', 'agent'])).toBe(false)
    expect(isDsbHeadlessOneShotCommand(['dsb', '--resume', 'sess-1'])).toBe(false)
  })

  it('resumes a full-screen session by id', () => {
    expect(getAgentResumeArgv('dsb', { key: 'session_id', id: 'sess-1' })).toEqual([
      'dsb',
      '--resume',
      'sess-1'
    ])
  })
})
