import { cookies } from 'next/headers'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { queryOne, execute } from '@/lib/db'

const SESSION_COOKIE = 'session'
const SESSION_DAYS = 30
const TOKEN_MINUTES = 15

export const SESSION_COOKIE_NAME = SESSION_COOKIE
export const SESSION_MAX_AGE_SECONDS = SESSION_DAYS * 24 * 60 * 60

export interface SessionUser {
  userId: string
  email: string
}

/** Generate a UUID for a new database row. */
export function newId(): string {
  return randomUUID()
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function isoIn(ms: number): string {
  return new Date(Date.now() + ms).toISOString()
}

// --- magic-link tokens -----------------------------------------------------

/** Create a single-use magic-link token (15-min expiry). Returns the raw token. */
export async function createMagicLinkToken(email: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  await execute(
    'INSERT INTO auth_tokens (id, token_hash, email, expires_at) VALUES (?, ?, ?, ?)',
    [newId(), hashToken(token), email.toLowerCase(), isoIn(TOKEN_MINUTES * 60 * 1000)],
  )
  return token
}

/** Validate and consume a magic-link token. Returns the email on success, else null. */
export async function consumeMagicLinkToken(token: string): Promise<string | null> {
  const now = new Date().toISOString()
  const row = await queryOne<{ email: string }>(
    `UPDATE auth_tokens SET used_at = ?
      WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?
      RETURNING email`,
    [now, hashToken(token), now],
  )
  return row?.email ?? null
}

// --- users -----------------------------------------------------------------

/** Find a user by email, creating the row if absent. Returns the user id. */
export async function findOrCreateUser(email: string): Promise<string> {
  const normalized = email.toLowerCase()
  const existing = await queryOne<{ id: string }>('SELECT id FROM users WHERE email = ?', [normalized])
  if (existing) return existing.id
  const id = newId()
  await execute('INSERT INTO users (id, email) VALUES (?, ?)', [id, normalized])
  return id
}

// --- sessions --------------------------------------------------------------

/** Create a 30-day session and return its id (the cookie value). */
export async function createSession(userId: string): Promise<string> {
  const sessionId = randomBytes(32).toString('hex')
  await execute(
    'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)',
    [sessionId, userId, isoIn(SESSION_DAYS * 24 * 60 * 60 * 1000)],
  )
  return sessionId
}

export async function destroySession(sessionId: string): Promise<void> {
  await execute('DELETE FROM sessions WHERE id = ?', [sessionId])
}

/** Read the session cookie and return the signed-in user, or null. */
export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value
  if (!sessionId) return null
  const row = await queryOne<{ user_id: string; email: string; expires_at: string }>(
    `SELECT s.user_id, s.expires_at, u.email
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = ?`,
    [sessionId],
  )
  if (!row) return null
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await destroySession(sessionId)
    return null
  }
  return { userId: row.user_id, email: row.email }
}

/** Resolve the user's organization id (replaces the get_user_org_id RPC). */
export async function getCurrentOrgId(userId: string): Promise<string | null> {
  const row = await queryOne<{ org_id: string }>(
    'SELECT org_id FROM organization_members WHERE user_id = ? LIMIT 1',
    [userId],
  )
  return row?.org_id ?? null
}
