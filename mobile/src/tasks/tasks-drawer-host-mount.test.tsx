import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BottomDrawer } from '../components/BottomDrawer'
import { TasksDrawerModalHost } from './tasks-drawer-host-mount'

vi.mock('../components/mounted-bottom-drawer', () => ({
  MountedBottomDrawer: 'MountedBottomDrawer'
}))

vi.mock('react-native', () => ({
  Modal: ({ children }: { children?: unknown }) => children
}))

function Stack({ openCount }: { openCount: number }) {
  return createElement(
    TasksDrawerModalHost,
    { openCount, onRequestClose: () => {} },
    createElement(
      BottomDrawer,
      { visible: openCount > 1, onClose: () => {} },
      createElement('Top')
    ),
    createElement(
      BottomDrawer,
      { visible: openCount > 0, onClose: () => {} },
      createElement('Base')
    )
  )
}

function renderHost(openCount: number): ReactTestRenderer {
  let renderer: ReactTestRenderer | null = null
  act(() => {
    renderer = create(createElement(Stack, { openCount }))
  })
  if (!renderer) {
    throw new Error('drawer host did not render')
  }
  return renderer
}

function setOpenCount(renderer: ReactTestRenderer, openCount: number): void {
  act(() => {
    renderer.update(createElement(Stack, { openCount }))
  })
}

function mountedDrawers(renderer: ReactTestRenderer) {
  return renderer.root.findAllByType('MountedBottomDrawer')
}

describe('TasksDrawerModalHost close', () => {
  beforeEach(() => {
    const originalConsoleError = console.error
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      const message = args[0]
      if (
        typeof message === 'string' &&
        message.includes('The current testing environment is not configured to support act')
      ) {
        return
      }
      originalConsoleError(...args)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps the host mounted until the last sheet finishes closing', () => {
    const renderer = renderHost(1)

    expect(mountedDrawers(renderer)).toHaveLength(1)
    setOpenCount(renderer, 0)
    expect(mountedDrawers(renderer)).toHaveLength(1)
    expect(mountedDrawers(renderer)[0]?.props.visible).toBe(false)

    act(() => {
      mountedDrawers(renderer)[0]?.props.onHidden()
    })

    expect(mountedDrawers(renderer)).toHaveLength(0)
  })

  it('stays mounted until every sheet closed in that update has finished', () => {
    const renderer = renderHost(2)
    setOpenCount(renderer, 0)
    expect(mountedDrawers(renderer)).toHaveLength(2)

    act(() => {
      mountedDrawers(renderer)[0]?.props.onHidden()
    })
    expect(mountedDrawers(renderer)).toHaveLength(1)

    act(() => {
      mountedDrawers(renderer)[0]?.props.onHidden()
    })
    expect(mountedDrawers(renderer)).toHaveLength(0)
  })
})
