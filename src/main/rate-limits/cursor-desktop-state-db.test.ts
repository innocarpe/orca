import { mkdtempSync, rmSync, statSync, truncateSync, writeFileSync } from 'node:fs'
import type * as NodeFs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CURSOR_DESKTOP_WAL_SKIP_BYTES, readCursorDesktopProfile } from './cursor-desktop-state-db'

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof NodeFs>('node:fs')
  return {
    ...actual,
    statSync: (...args: Parameters<typeof NodeFs.statSync>) => {
      if (String(args[0]).endsWith('stat-denied.vscdb-wal')) {
        throw Object.assign(new Error('denied'), { code: 'EACCES' })
      }
      return actual.statSync(...args)
    }
  }
})

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

function seedWalDatabase(dir: string): { dbPath: string; close: () => void } {
  const dbPath = join(dir, 'state.vscdb')
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('CREATE TABLE ItemTable (key TEXT, value TEXT)')
  db.prepare('INSERT INTO ItemTable (key, value) VALUES (?, ?)').run(
    'cursorAuth/accessToken',
    'wal-token'
  )
  return { dbPath, close: () => db.close() }
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

  it('reads a login from a WAL database that is below the skip limit', () => {
    const seeded = seedWalDatabase(tempDir())
    try {
      expect(statSync(`${seeded.dbPath}-wal`).isFile()).toBe(true)
      expect(statSync(`${seeded.dbPath}-wal`).size).toBeLessThanOrEqual(CURSOR_DESKTOP_WAL_SKIP_BYTES)
      expect(readCursorDesktopProfile(seeded.dbPath)).toEqual({
        status: 'ok',
        profile: {
          accessToken: 'wal-token',
          email: null,
          membershipType: null,
          subscriptionStatus: null
        }
      })
    } finally {
      seeded.close()
    }
  })

  it('does not open a database whose WAL is large enough to stall the main thread', () => {
    const dbPath = join(tempDir(), 'state.vscdb')
    writeFileSync(dbPath, 'not-a-database')
    const walPath = `${dbPath}-wal`
    writeFileSync(walPath, '')
    truncateSync(walPath, CURSOR_DESKTOP_WAL_SKIP_BYTES + 1)

    expect(readCursorDesktopProfile(dbPath)).toEqual({
      status: 'skipped',
      reason: 'wal-too-large'
    })
  })

  it('does not open a database when the WAL size cannot be read', () => {
    const dbPath = join(tempDir(), 'stat-denied.vscdb')
    writeFileSync(dbPath, 'not-a-database')

    expect(readCursorDesktopProfile(dbPath)).toEqual({
      status: 'skipped',
      reason: 'wal-unreadable'
    })
  })
})
