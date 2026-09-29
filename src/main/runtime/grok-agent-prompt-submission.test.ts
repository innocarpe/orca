import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAgentPromptSubmissionRuntime } from './agent-prompt-submission-runtime-test-fixture'
import type { OrcaRuntimeService } from './orca-runtime'
import { buildAgentPromptPasteBytes } from '../../shared/agent-prompt-injection'

vi.mock('../git/worktree', () => {
  const worktrees = [
    { path: '/tmp/worktree-a', head: 'abc', branch: 'main', isBare: false, isMainWorktree: false }
  ]
  return {
    listWorktrees: vi.fn().mockResolvedValue(worktrees),
    listWorktreesStrict: vi.fn().mockResolvedValue(worktrees)
  }
})

function setForegroundController(
  runtime: OrcaRuntimeService,
  writes: string[],
  getForegroundProcess: () => Promise<string | null>
): void {
  runtime.setPtyController({
    spawn: async () => ({ id: 'pty-prompt' }),
    write: (_ptyId, data) => {
      writes.push(data)
      return true
    },
    kill: () => true,
    getForegroundProcess
  })
}

async function submit(
  runtime: OrcaRuntimeService,
  handle: string,
  text = 'line one\r\nline two\rlast'
): Promise<void> {
  const result = runtime.sendTerminalAgentPrompt(handle, text, {
    inputKind: 'driving',
    acceptQueued: true,
    requestId: 'grok-test',
    observationTimeoutMs: 0
  })
  await vi.runAllTimersAsync()
  await result
}

describe('Grok prompt delivery', () => {
  afterEach(() => vi.useRealTimers())

  it('writes plain normalized text and one scheduled Enter for a Grok launch', async () => {
    vi.useFakeTimers()
    const { runtime, handle, writes } = await createAgentPromptSubmissionRuntime(() => {}, 'grok')
    await submit(runtime, handle)
    expect(writes).toEqual(['line one\nline two\nlast', '\r'])
  })

  it('uses the current Grok process instead of a stale Claude launch and cache', async () => {
    vi.useFakeTimers()
    const { runtime, handle, writes } = await createAgentPromptSubmissionRuntime(() => {}, 'claude')
    const pty = runtime['ptysById'].get('pty-prompt')!
    pty.foregroundAgent = 'claude'
    const read = vi.fn(async () => 'grok')
    setForegroundController(runtime, writes, read)
    await submit(runtime, handle)
    expect(read).toHaveBeenCalled()
    expect(writes).toEqual(['line one\nline two\nlast', '\r'])
    expect(pty.launchAgent).toBe('claude')
    expect(pty.foregroundAgent).toBe('claude')
  })

  it('awaits the foreground probe for a restored terminal with no agent fields', async () => {
    vi.useFakeTimers()
    const { runtime, handle, writes } = await createAgentPromptSubmissionRuntime(() => {}, 'grok')
    const pty = runtime['ptysById'].get('pty-prompt')!
    pty.launchAgent = null
    pty.foregroundAgent = null
    let finish = (_process: string): void => {}
    const foreground = new Promise<string>((resolve) => {
      finish = resolve
    })
    setForegroundController(runtime, writes, () => foreground)
    const result = runtime.sendTerminalAgentPrompt(handle, 'restored', {
      inputKind: 'driving',
      acceptQueued: true,
      requestId: 'restored-grok'
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(writes).toEqual([])
    finish('grok')
    await vi.runAllTimersAsync()
    await result
    expect(writes).toEqual(['restored', '\r'])
  })

  it('probes a restored leaf before selecting its prompt format', async () => {
    vi.useFakeTimers()
    const { runtime, writes } = await createAgentPromptSubmissionRuntime(() => {})
    setForegroundController(runtime, writes, async () => 'grok')
    const worktreeId = 'repo-1::/tmp/worktree-a'
    runtime.attachWindow(1)
    runtime.syncWindowGraph(1, {
      tabs: [{ tabId: 'restored', worktreeId, title: '', activeLeafId: 'leaf', layout: null }],
      leaves: [
        {
          tabId: 'restored',
          worktreeId,
          leafId: 'leaf',
          paneRuntimeId: 1,
          ptyId: 'pty-restored',
          paneTitle: null,
          title: ''
        }
      ]
    })
    const terminal = (await runtime.listTerminals(`id:${worktreeId}`)).terminals.find(
      (row) => row.ptyId === 'pty-restored'
    )
    expect(terminal).toBeDefined()
    await submit(runtime, terminal!.handle, 'restored leaf')
    expect(writes).toEqual(['restored leaf', '\r'])
  })

  it('keeps bracketed paste for a current Codex process despite a stale Grok launch', async () => {
    vi.useFakeTimers()
    const { runtime, handle, writes } = await createAgentPromptSubmissionRuntime(() => {}, 'grok')
    setForegroundController(runtime, writes, async () => 'codex')
    await submit(runtime, handle, 'current Codex')
    expect(writes).toEqual([buildAgentPromptPasteBytes('current Codex'), '\r'])
  })

  it('uses the default paste format when a current process is unrecognized', async () => {
    vi.useFakeTimers()
    const { runtime, handle, writes } = await createAgentPromptSubmissionRuntime(() => {}, 'grok')
    setForegroundController(runtime, writes, async () => 'bash')
    await submit(runtime, handle, 'unknown')
    expect(writes).toEqual([buildAgentPromptPasteBytes('unknown'), '\r'])
  })

  it('rejects a generation change while its foreground probe is pending', async () => {
    vi.useFakeTimers()
    const { runtime, handle, writes } = await createAgentPromptSubmissionRuntime(() => {}, 'grok')
    let finish = (_process: string): void => {}
    const foreground = new Promise<string>((resolve) => {
      finish = resolve
    })
    setForegroundController(runtime, writes, () => foreground)
    const result = runtime.sendTerminalAgentPrompt(handle, 'stale', { inputKind: 'driving' })
    const rejected = expect(result).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(0)
    runtime.onPtyExit('pty-prompt', 0)
    finish('grok')
    await vi.runAllTimersAsync()
    await rejected
    expect(writes).toEqual([])
  })

  it('rejects a foreground result from a replaced execution controller', async () => {
    vi.useFakeTimers()
    const { runtime, handle, writes } = await createAgentPromptSubmissionRuntime(() => {}, 'grok')
    let finish = (_process: string): void => {}
    const foreground = new Promise<string>((resolve) => {
      finish = resolve
    })
    setForegroundController(runtime, writes, () => foreground)
    const result = runtime.sendTerminalAgentPrompt(handle, 'stale', { inputKind: 'driving' })
    const rejected = expect(result).rejects.toThrow('terminal_not_writable')
    await vi.advanceTimersByTimeAsync(0)
    setForegroundController(runtime, writes, async () => 'codex')
    finish('grok')
    await vi.runAllTimersAsync()
    await rejected
    expect(writes).toEqual([])
  })
})
