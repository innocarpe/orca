import { existsSync, statSync } from 'node:fs'
import { z } from 'zod'
import SyncDatabase from '../sqlite/sync-database'

const TOKEN_KEY = 'cursorAuth/accessToken'
const EMAIL_KEY = 'cursorAuth/cachedEmail'
const MEMBERSHIP_KEY = 'cursorAuth/stripeMembershipType'
const SUBSCRIPTION_KEY = 'cursorAuth/stripeSubscriptionStatus'
const OPEN_TIMEOUT_MS = 250
// Why: node:sqlite's timeout only bounds a lock wait. Opening a multi-GB WAL
// replays it on the main thread before the first prepare returns (#24360).
export const CURSOR_DESKTOP_WAL_SKIP_BYTES = 32 * 1024 * 1024
const WAL_TOO_LARGE_ERROR = 'Cursor desktop login database is too large to open here'

export type CursorDesktopProfile = {
  accessToken: string | null
  email: string | null
  membershipType: string | null
  subscriptionStatus: string | null
}

export type CursorDesktopProfileReadResult =
  | { status: 'missing' }
  | { status: 'error'; error: string }
  | { status: 'ok'; profile: CursorDesktopProfile }

const rowsSchema = z.array(z.object({ key: z.unknown(), value: z.unknown() }).partial())

function valueAsString(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString('utf8').trim() || null
  }
  return null
}

/** Reads the Cursor IDE's stored session. Opens read-only in place; state.vscdb can be multi-GB. */
function cursorDesktopWalBytes(dbPath: string): number {
  try {
    const stat = statSync(`${dbPath}-wal`)
    return stat.isFile() ? stat.size : 0
  } catch {
    return 0
  }
}

export function readCursorDesktopProfile(dbPath: string): CursorDesktopProfileReadResult {
  if (!existsSync(dbPath)) {
    return { status: 'missing' }
  }
  if (cursorDesktopWalBytes(dbPath) > CURSOR_DESKTOP_WAL_SKIP_BYTES) {
    return { status: 'error', error: WAL_TOO_LARGE_ERROR }
  }
  let db: SyncDatabase | null = null
  try {
    db = new SyncDatabase(dbPath, {
      readonly: true,
      fileMustExist: true,
      timeout: OPEN_TIMEOUT_MS
    })
    const rows = rowsSchema.parse(
      db
        .prepare('SELECT key, value FROM ItemTable WHERE key IN (?, ?, ?, ?)')
        .all(TOKEN_KEY, EMAIL_KEY, MEMBERSHIP_KEY, SUBSCRIPTION_KEY)
    )
    const byKey = new Map<string, string>()
    for (const row of rows) {
      const value = valueAsString(row.value)
      if (typeof row.key === 'string' && value) {
        byKey.set(row.key, value)
      }
    }
    return {
      status: 'ok',
      profile: {
        accessToken: byKey.get(TOKEN_KEY) ?? null,
        email: byKey.get(EMAIL_KEY) ?? null,
        membershipType: byKey.get(MEMBERSHIP_KEY) ?? null,
        subscriptionStatus: byKey.get(SUBSCRIPTION_KEY) ?? null
      }
    }
  } catch {
    return { status: 'error', error: 'Unable to read the Cursor desktop login' }
  } finally {
    db?.close()
  }
}
