import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Why source-slice tests: the bridge's unit tests inject their own resolver and
// lifecycle, so they stay green if index.ts stops wiring the real ones — which
// silently brings back the exact double count and wall-clock billing the bridge
// exists to prevent. Same pattern as desktop-startup-ordering.test.ts.

function readIndexSource(): string {
  return readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')
}

describe('hook status stats bridge wiring', () => {
  it('wires the bridge to the real pane→PTY resolver', () => {
    const source = readIndexSource()
    const createIndex = source.indexOf('createHookStatusStatsBridge(stats')
    expect(createIndex).toBeGreaterThanOrEqual(0)
    const optionsSlice = source.slice(createIndex, createIndex + 400)
    expect(optionsSlice).toContain('resolvePtyId')
    expect(optionsSlice).toContain('getTerminalPtyIdForPaneKey')
  })

  it('sweeps open hook sessions inside the teardown closure', () => {
    const source = readIndexSource()
    const assignIndex = source.indexOf('unsubscribeHookStatusStatsBridge = () => {')
    expect(assignIndex).toBeGreaterThanOrEqual(0)
    const closureEnd = source.indexOf('}', source.indexOf('bridge.apply([])', assignIndex))
    expect(closureEnd).toBeGreaterThan(assignIndex)
    expect(source.slice(assignIndex, closureEnd)).toContain('bridge.apply([])')
  })

  it('tears the bridge down only on the committed quit path, before the stats flush', () => {
    const source = readIndexSource()
    const beforeQuitStart = source.indexOf("app.on('before-quit'")
    const willQuitStart = source.indexOf("app.on('will-quit'")
    const windowAllClosedStart = source.indexOf("app.on('window-all-closed'", willQuitStart)
    expect(beforeQuitStart).toBeGreaterThanOrEqual(0)
    expect(willQuitStart).toBeGreaterThan(beforeQuitStart)
    expect(windowAllClosedStart).toBeGreaterThan(willQuitStart)

    // before-quit also fires on aborted quits (updater defer, dirty-editor
    // veto); tearing down there would silently revert #10201 for the rest of
    // the process because nothing re-subscribes.
    expect(source.slice(beforeQuitStart, willQuitStart)).not.toContain(
      'unsubscribeHookStatusStatsBridge'
    )

    const willQuitSlice = source.slice(willQuitStart, windowAllClosedStart)
    const teardownIndex = willQuitSlice.indexOf('unsubscribeHookStatusStatsBridge?.()')
    const flushIndex = willQuitSlice.indexOf('stats?.flush()')
    expect(teardownIndex).toBeGreaterThanOrEqual(0)
    expect(flushIndex).toBeGreaterThan(teardownIndex)
  })
})
