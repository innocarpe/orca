import { describe, expect, it, vi } from 'vitest'
import { createOsOpenMarkdownBridge } from './os-open-markdown-bridge'

function makeWindow(send = vi.fn()) {
  return {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      send
    }
  }
}

describe('createOsOpenMarkdownBridge', () => {
  it('queues argv markdown paths and flushes MarkdownDocuments to the renderer', async () => {
    const send = vi.fn()
    const authorizePath = vi.fn()
    const bridge = createOsOpenMarkdownBridge({
      platform: 'linux',
      resolveFloatingRoot: async () => '/tmp/floating',
      authorizePath
    })

    bridge.enqueueArgv(['/usr/bin/orca-ide', '/home/dev/notes.md', '--foo'])
    expect(bridge.peekQueuedPaths()).toEqual(['/home/dev/notes.md'])

    await bridge.flush(() => makeWindow(send) as never)

    expect(authorizePath).toHaveBeenCalledWith('/home/dev/notes.md')
    expect(send).toHaveBeenCalledWith('ui:openFloatingMarkdownDocuments', [
      expect.objectContaining({
        filePath: '/home/dev/notes.md',
        relativePath: 'notes.md',
        basename: 'notes.md'
      })
    ])
    expect(bridge.peekQueuedPaths()).toEqual([])
  })

  it('keeps the queue when no main window is available yet', async () => {
    const bridge = createOsOpenMarkdownBridge({
      platform: 'linux',
      resolveFloatingRoot: async () => '/tmp/floating',
      authorizePath: vi.fn()
    })
    bridge.enqueuePaths(['/tmp/a.md'])
    await bridge.flush(() => null)
    expect(bridge.peekQueuedPaths()).toEqual(['/tmp/a.md'])
  })

  it('skips paths that fail authorization without aborting the batch', async () => {
    const send = vi.fn()
    const authorizePath = vi.fn((filePath: string) => {
      if (filePath.endsWith('bad.md')) {
        throw new Error('denied')
      }
    })
    const bridge = createOsOpenMarkdownBridge({
      platform: 'linux',
      resolveFloatingRoot: async () => '/tmp/floating',
      authorizePath
    })
    bridge.enqueuePaths(['/tmp/bad.md', '/tmp/good.md'])
    await bridge.flush(() => makeWindow(send) as never)
    expect(send).toHaveBeenCalledWith('ui:openFloatingMarkdownDocuments', [
      expect.objectContaining({ filePath: '/tmp/good.md' })
    ])
  })
})
