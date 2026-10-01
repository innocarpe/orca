import { mkdtempSync, rmSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { CURSOR_DESKTOP_WAL_SKIP_BYTES, readCursorDesktopProfile } from './cursor-desktop-state-db'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cursor-desktop-'))
  dirs.push(dir)
  return dir
}

function seedDatabase(dir: string): string {
  const dbPath = join(dir, 'state.vscdb')
  const db = new DatabaseSync(dbPath)
  db.exec('CREATE TABLE ItemTable (key TEXT, value TEXT)')
  db.prepare('INSERT INTO ItemTable (key, value) VALUES (?, ?)').run(
    'cursorAuth/accessToken',
    'token-1'
  )
  db.close()
  return dbPath
}

describe('readCursorDesktopProfile', () => {
  it('reads a desktop login from a normal database', () => {
    const read = readCursorDesktopProfile(seedDatabase(tempDir()))
    expect(read).toEqual({
      status: 'ok',
      profile: {
        accessToken: 'token-1',
        email: null,
        membershipType: null,
        subscriptionStatus: null
      }
    })
  })

  it('reports a missing database without opening one', () => {
    expect(readCursorDesktopProfile(join(tempDir(), 'missing.vscdb'))).toEqual({
      status: 'missing'
    })
  })

  it('does not open a database whose WAL is large enough to stall the main thread', () => {
    const dbPath = join(tempDir(), 'state.vscdb')
    writeFileSync(dbPath, 'not-a-database')
    const walPath = `${dbPath}-wal`
    writeFileSync(walPath, '')
    truncateSync(walPath, CURSOR_DESKTOP_WAL_SKIP_BYTES + 1)

    expect(readCursorDesktopProfile(dbPath)).toEqual({
      status: 'error',
      error: 'Cursor desktop login database is too large to open here'
    })
  })
})
