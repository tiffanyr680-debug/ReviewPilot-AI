# Supabase → Turso Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate ReviewPilot AI's data layer from Supabase (Postgres) to Turso (libSQL/SQLite), rebuilding authentication and per-organization data isolation in application code, with no user-facing behavior change.

**Architecture:** A thin SQL data layer (`lib/db.ts`) wraps the Turso `@libsql/client`. A custom magic-link auth system (`lib/auth.ts` + `users`/`auth_tokens`/`sessions` tables) replaces Supabase Auth. Row-level security is replaced by explicit `WHERE org_id = ?` filtering in every query. The browser Supabase client is removed; the 4 screens that queried the database directly call new server endpoints instead.

**Tech Stack:** Next.js 15 (App Router), TypeScript, `@libsql/client`, Resend (login emails), Node `crypto` (tokens/sessions).

**Verification approach:** This codebase has no test harness, and the risk surface of this migration is integration wiring, not isolated logic. Each task is verified with `npm run type-check` (the strongest automated signal for a fully-typed migration). `npm run lint` and `npm run build` run at the end (Task 30), followed by functional testing of the running app. No unit-test framework is added — that would be scope the migration does not need.

**Reference spec:** `docs/superpowers/specs/2026-05-16-turso-migration-design.md`

**Working directory:** All paths are relative to the ReviewPilot AI repo root (`C:\Users\Tiffany\Documents\ReviewPilot AI`). All `git` commands run in that repo.

**Key conventions used throughout this plan:**
- IDs are generated in app code with `newId()` (from `lib/auth.ts`, wraps `crypto.randomUUID()`).
- Timestamps are ISO-8601 UTC strings. Auto-set columns default to `strftime('%Y-%m-%dT%H:%M:%fZ','now')`; app-supplied timestamps use `new Date().toISOString()`.
- Every SQL query is parameterized with `?` placeholders — never string-interpolate values.
- Every query touching org-scoped data includes `WHERE org_id = ?` (or joins through an org-scoped row). This is the security model — do not omit it.
- `lib/db.ts` helpers: `db()` (raw client, for `.batch()`), `queryMany<T>(sql,args)`, `queryOne<T>(sql,args)`, `execute(sql,args)`, `count(sql,args)`.

---

## Phase 1 — Database foundation

### Task 1: Swap dependencies and configure environment

**Files:**
- Modify: `package.json`
- Modify: `.env.local`

**Prerequisite — create the Turso database (user action):**
In the Turso dashboard (https://app.turso.tech), click **Create Database**, name it `reviewpilot`, and select a region. Open the database and copy:
- the **database URL** (looks like `libsql://reviewpilot-<org>.turso.io`)
- a freshly created **auth token** (use the "Create Token" button)

- [ ] **Step 1: Install/remove npm packages**

Run:
```bash
npm uninstall @supabase/supabase-js @supabase/ssr
npm install @libsql/client
```
Expected: `package.json` no longer lists `@supabase/*`; it now lists `@libsql/client`.

- [ ] **Step 2: Set Turso credentials in `.env.local`**

Edit `.env.local` — remove the three Supabase lines and add the two Turso lines. The file becomes:
```
TURSO_DATABASE_URL=libsql://reviewpilot-<org>.turso.io
TURSO_AUTH_TOKEN=<the auth token from the Turso dashboard>
NEXT_PUBLIC_APP_URL=http://localhost:3100
CRON_SECRET=local-dev-secret
RESEND_API_KEY=<a Resend API key>
RESEND_FROM_EMAIL=<a verified Resend sender address>
```
`RESEND_API_KEY` and `RESEND_FROM_EMAIL` are **required** — login emails are sent through Resend. Get them from https://resend.com (API Keys, and a verified domain/sender).

- [ ] **Step 3: Verify the install**

Run: `npm run type-check`
Expected: it still reports the pre-existing errors from files that import `@/lib/supabase/*` — that is fine, later tasks fix them. It must NOT fail to find `@libsql/client`.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: swap Supabase packages for @libsql/client"
```

---

### Task 2: Create the Turso schema file

**Files:**
- Create: `db/schema.sql`

- [ ] **Step 1: Create `db/schema.sql`**

```sql
-- ReviewPilot AI — Turso (libSQL/SQLite) schema.
-- IDs are app-generated UUID strings. Timestamps are ISO-8601 UTC strings.

CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS auth_tokens (
  id         TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  email      TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS organizations (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  owner_id    TEXT REFERENCES users(id) ON DELETE CASCADE,
  brand_voice TEXT NOT NULL DEFAULT 'We are a friendly, professional local service business. Our replies should be warm, grateful, and concise.',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS organization_members (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(org_id, user_id)
);

CREATE TABLE IF NOT EXISTS locations (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  address         TEXT,
  google_place_id TEXT,
  facebook_page_id TEXT,
  rating_avg      REAL NOT NULL DEFAULT 0,
  review_count    INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS reviews (
  id            TEXT PRIMARY KEY,
  location_id   TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source        TEXT NOT NULL CHECK (source IN ('google','facebook','yelp','manual')),
  author_name   TEXT,
  rating        INTEGER CHECK (rating BETWEEN 1 AND 5),
  content       TEXT,
  reply_content TEXT,
  sentiment     TEXT CHECK (sentiment IN ('positive','neutral','negative')),
  posted_at     TEXT,
  synced_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS review_requests (
  id             TEXT PRIMARY KEY,
  org_id         TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id    TEXT REFERENCES locations(id),
  customer_name  TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  template_id    TEXT,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','opened','clicked','completed','failed')),
  sent_at        TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS request_templates (
  id                  TEXT PRIMARY KEY,
  org_id              TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  sms_body            TEXT,
  email_subject       TEXT,
  email_body          TEXT,
  trigger_delay_hours INTEGER NOT NULL DEFAULT 24,
  active              INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id                   TEXT PRIMARY KEY,
  org_id               TEXT NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_customer_id   TEXT,
  stripe_subscription_id TEXT,
  status               TEXT NOT NULL DEFAULT 'inactive',
  plan                 TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter','pro','agency')),
  current_period_end   TEXT,
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     TEXT REFERENCES users(id),
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  metadata    TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_reviews_location_source ON reviews(location_id, source);
CREATE INDEX IF NOT EXISTS idx_reviews_org_sentiment   ON reviews(org_id, sentiment);
CREATE INDEX IF NOT EXISTS idx_reviews_org_posted      ON reviews(org_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_org_status     ON review_requests(org_id, status);
CREATE INDEX IF NOT EXISTS idx_locations_org           ON locations(org_id);
CREATE INDEX IF NOT EXISTS idx_members_user            ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user           ON sessions(user_id);

-- Used by review-sync upserts (INSERT ... ON CONFLICT). Postgres lacked this
-- unique constraint; it is required for ON CONFLICT to work in SQLite.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_dedupe
  ON reviews(location_id, source, author_name, posted_at);
```

Note: foreign-key `ON DELETE CASCADE` is declared for documentation/intent, but the app does NOT rely on cascade enforcement (SQLite foreign keys are off by default). The only multi-table delete — deleting a location — removes child rows explicitly (Task 14).

- [ ] **Step 2: Commit**

```bash
git add db/schema.sql
git commit -m "feat: add Turso SQLite schema"
```

---

### Task 3: Create the schema-load script and load the schema

**Files:**
- Create: `scripts/load-schema.mjs`

- [ ] **Step 1: Create `scripts/load-schema.mjs`**

```js
import { createClient } from '@libsql/client'
import { readFileSync } from 'node:fs'

const url = process.env.TURSO_DATABASE_URL
const authToken = process.env.TURSO_AUTH_TOKEN

if (!url) {
  console.error('TURSO_DATABASE_URL is not set. Run with: node --env-file=.env.local scripts/load-schema.mjs')
  process.exit(1)
}

const sql = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8')
const client = createClient({ url, authToken })

try {
  await client.executeMultiple(sql)
  console.log('Schema loaded into Turso database.')
} catch (err) {
  console.error('Failed to load schema:', err)
  process.exit(1)
} finally {
  client.close()
}
```

- [ ] **Step 2: Run the script against the Turso database**

Run: `node --env-file=.env.local scripts/load-schema.mjs`
Expected: prints `Schema loaded into Turso database.` (Node 20+ supports `--env-file`.)

- [ ] **Step 3: Verify the tables exist**

Run:
```bash
node --env-file=.env.local -e "const {createClient}=await import('@libsql/client');const c=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});const r=await c.execute(\"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name\");console.log(r.rows.map(x=>x.name).join(', '));c.close()"
```
Expected: `audit_logs, auth_tokens, locations, organization_members, organizations, request_templates, review_requests, reviews, sessions, subscriptions, users`

- [ ] **Step 4: Commit**

```bash
git add scripts/load-schema.mjs
git commit -m "feat: add Turso schema-load script"
```

---

### Task 4: Create the data-access layer

**Files:**
- Create: `lib/db.ts`

- [ ] **Step 1: Create `lib/db.ts`**

```ts
import { createClient, type Client, type InArgs, type Row } from '@libsql/client'

let _client: Client | null = null

/** Raw libSQL client — use for `.batch()` (transactions). Prefer the helpers below. */
export function db(): Client {
  if (!_client) {
    const url = process.env.TURSO_DATABASE_URL
    if (!url) throw new Error('TURSO_DATABASE_URL is not configured')
    _client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  }
  return _client
}

/** Run a query and return all rows, typed as T. */
export async function queryMany<T = Row>(sql: string, args: InArgs = []): Promise<T[]> {
  const result = await db().execute({ sql, args })
  return result.rows as unknown as T[]
}

/** Run a query and return the first row (typed as T) or null. */
export async function queryOne<T = Row>(sql: string, args: InArgs = []): Promise<T | null> {
  const rows = await queryMany<T>(sql, args)
  return rows[0] ?? null
}

/** Run an INSERT/UPDATE/DELETE; returns the number of rows affected. */
export async function execute(sql: string, args: InArgs = []): Promise<{ rowsAffected: number }> {
  const result = await db().execute({ sql, args })
  return { rowsAffected: result.rowsAffected }
}

/** Run a `SELECT COUNT(*) AS c ...` query and return the count as a number. */
export async function count(sql: string, args: InArgs = []): Promise<number> {
  const row = await queryOne<{ c: number }>(sql, args)
  return row ? Number(row.c) : 0
}
```

- [ ] **Step 2: Verify**

Run: `npm run type-check`
Expected: no NEW errors from `lib/db.ts` (pre-existing `@/lib/supabase/*` errors elsewhere are still expected).

- [ ] **Step 3: Commit**

```bash
git add lib/db.ts
git commit -m "feat: add Turso data-access layer"
```

---

### Task 5: Create the database row types

**Files:**
- Create: `lib/db-types.ts`

These replace the named types currently exported from `lib/supabase/types.ts` (`Organization`, `OrganizationMember`, `Location`, `Review`, `ReviewRequest`, `RequestTemplate`, `Subscription`, `AuditLog`), plus a new `User`.

- [ ] **Step 1: Create `lib/db-types.ts`**

```ts
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface User {
  id: string
  email: string
  created_at: string
}

export interface Organization {
  id: string
  name: string
  owner_id: string | null
  brand_voice: string
  created_at: string
}

export interface OrganizationMember {
  id: string
  org_id: string
  user_id: string
  role: 'owner' | 'admin' | 'member'
  created_at: string
}

export interface Location {
  id: string
  org_id: string
  name: string
  address: string | null
  google_place_id: string | null
  facebook_page_id: string | null
  rating_avg: number
  review_count: number
  created_at: string
}

export interface Review {
  id: string
  location_id: string
  org_id: string
  source: 'google' | 'facebook' | 'yelp' | 'manual'
  author_name: string | null
  rating: number | null
  content: string | null
  reply_content: string | null
  sentiment: 'positive' | 'neutral' | 'negative' | null
  posted_at: string | null
  synced_at: string
}

export interface ReviewRequest {
  id: string
  org_id: string
  location_id: string | null
  customer_name: string | null
  customer_phone: string | null
  customer_email: string | null
  template_id: string | null
  status: 'pending' | 'sent' | 'opened' | 'clicked' | 'completed' | 'failed'
  sent_at: string | null
  created_at: string
}

/** As exposed to UI code. The DB stores `active` as INTEGER 0/1; convert at the
 *  query boundary (see app/dashboard/requests/page.tsx). */
export interface RequestTemplate {
  id: string
  org_id: string
  name: string
  sms_body: string | null
  email_subject: string | null
  email_body: string | null
  trigger_delay_hours: number
  active: boolean
  created_at: string
}

export interface Subscription {
  id: string
  org_id: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  status: string
  plan: 'starter' | 'pro' | 'agency'
  current_period_end: string | null
  updated_at: string
}

export interface AuditLog {
  id: string
  org_id: string
  user_id: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  metadata: Json | null
  created_at: string
}
```

- [ ] **Step 2: Verify**

Run: `npm run type-check`
Expected: no NEW errors from `lib/db-types.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/db-types.ts
git commit -m "feat: add Turso row types"
```

---

## Phase 2 — Authentication

### Task 6: Create the auth helper

**Files:**
- Create: `lib/auth.ts`

- [ ] **Step 1: Create `lib/auth.ts`**

```ts
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
  const row = await queryOne<{ id: string; email: string; expires_at: string; used_at: string | null }>(
    'SELECT id, email, expires_at, used_at FROM auth_tokens WHERE token_hash = ?',
    [hashToken(token)],
  )
  if (!row || row.used_at) return null
  if (new Date(row.expires_at).getTime() < Date.now()) return null
  await execute('UPDATE auth_tokens SET used_at = ? WHERE id = ?', [new Date().toISOString(), row.id])
  return row.email
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
```

- [ ] **Step 2: Verify**

Run: `npm run type-check`
Expected: no NEW errors from `lib/auth.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/auth.ts
git commit -m "feat: add custom magic-link auth helper"
```

---

### Task 7: Add the magic-link email sender

**Files:**
- Modify: `lib/email.ts`

- [ ] **Step 1: Append `sendMagicLinkEmail` to `lib/email.ts`**

Add this function at the end of `lib/email.ts` (after `sendNegativeReviewAlert`). It reuses the existing `getResend()` and `FROM` defined at the top of the file:

```ts
export async function sendMagicLinkEmail(to: string, signInLink: string): Promise<void> {
  const resend = getResend()
  await resend.emails.send({
    from: FROM,
    to,
    subject: 'Your ReviewPilot AI sign-in link',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #0F172A;">Sign in to ReviewPilot AI</h2>
        <p>Click the button below to sign in. This link expires in 15 minutes and can be used once.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${signInLink}" style="background-color: #10b981; color: white; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            Sign in
          </a>
        </div>
        <p style="color: #64748b; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  })
}
```

- [ ] **Step 2: Verify**

Run: `npm run type-check`
Expected: no NEW errors from `lib/email.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/email.ts
git commit -m "feat: add magic-link email sender"
```

---

### Task 8: Create the sign-in endpoint

**Files:**
- Create: `app/api/auth/signin/route.ts`

- [ ] **Step 1: Create `app/api/auth/signin/route.ts`**

```ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { findOrCreateUser, createMagicLinkToken } from '@/lib/auth'
import { sendMagicLinkEmail } from '@/lib/email'

const SignInSchema = z.object({ email: z.string().email() })

export async function POST(request: NextRequest) {
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = SignInSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'A valid email address is required' }, { status: 422 })
    }

    const email = parsed.data.email.toLowerCase()
    await findOrCreateUser(email)
    const token = await createMagicLinkToken(email)
    const signInLink = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback?token=${token}`
    await sendMagicLinkEmail(email, signInLink)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error in POST /api/auth/signin:', err)
    return NextResponse.json({ error: 'Failed to send sign-in link' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify** — Run: `npm run type-check` — Expected: no NEW errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/auth/signin/route.ts
git commit -m "feat: add magic-link sign-in endpoint"
```

---

### Task 9: Rewrite the auth callback endpoint

**Files:**
- Modify (full rewrite): `app/api/auth/callback/route.ts`

- [ ] **Step 1: Replace the entire contents of `app/api/auth/callback/route.ts`**

```ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  consumeMagicLinkToken,
  findOrCreateUser,
  createSession,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from '@/lib/auth'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token) {
    return NextResponse.redirect(`${origin}/auth/signin?error=auth_callback_error`)
  }

  try {
    const email = await consumeMagicLinkToken(token)
    if (!email) {
      return NextResponse.redirect(`${origin}/auth/signin?error=auth_callback_error`)
    }

    const userId = await findOrCreateUser(email)
    const sessionId = await createSession(userId)

    const response = NextResponse.redirect(`${origin}/dashboard`)
    response.cookies.set(SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    })
    return response
  } catch (err) {
    console.error('Unexpected error in GET /api/auth/callback:', err)
    return NextResponse.redirect(`${origin}/auth/signin?error=auth_callback_error`)
  }
}
```

- [ ] **Step 2: Verify** — Run: `npm run type-check` — Expected: no NEW errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/auth/callback/route.ts
git commit -m "feat: rewrite auth callback for magic-link sessions"
```

---

### Task 10: Create the sign-out endpoint

**Files:**
- Create: `app/api/auth/signout/route.ts`

- [ ] **Step 1: Create `app/api/auth/signout/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { destroySession, SESSION_COOKIE_NAME } from '@/lib/auth'

export async function POST() {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value

  if (sessionId) {
    try {
      await destroySession(sessionId)
    } catch (err) {
      console.error('Error destroying session on signout:', err)
    }
  }

  const response = NextResponse.json({ success: true })
  response.cookies.set(SESSION_COOKIE_NAME, '', { httpOnly: true, path: '/', maxAge: 0 })
  return response
}
```

- [ ] **Step 2: Verify** — Run: `npm run type-check` — Expected: no NEW errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/auth/signout/route.ts
git commit -m "feat: add sign-out endpoint"
```

---

### Task 11: Update the sign-in page

**Files:**
- Modify: `app/auth/signin/page.tsx`

The page keeps all its JSX. Only the Supabase call is replaced.

- [ ] **Step 1: Remove the Supabase import**

Delete this line:
```ts
import { createClient } from '@/lib/supabase/client'
```

- [ ] **Step 2: Remove the `supabase` client variable**

Inside `SignInForm`, delete this line:
```ts
  const supabase = createClient()
```

- [ ] **Step 3: Replace the `handleSignIn` function body**

Replace the existing `handleSignIn` function with:
```ts
  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to send sign-in link')
      }
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send sign-in link')
    } finally {
      setLoading(false)
    }
  }
```

- [ ] **Step 4: Verify** — Run: `npm run type-check` — Expected: no NEW errors from `app/auth/signin/page.tsx`.

- [ ] **Step 5: Commit**

```bash
git add app/auth/signin/page.tsx
git commit -m "feat: sign-in page posts to magic-link endpoint"
```

---

### Task 12: Rewrite the dashboard layout and update TopBar

**Files:**
- Modify (full rewrite): `app/dashboard/layout.tsx`
- Modify: `components/TopBar.tsx`

- [ ] **Step 1: Replace the entire contents of `app/dashboard/layout.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { getSession, getCurrentOrgId, newId } from '@/lib/auth'
import { queryOne, execute, count } from '@/lib/db'
import { Sidebar } from '@/components/Sidebar'
import { TopBar } from '@/components/TopBar'

async function ensureOrgForUser(userId: string, userEmail: string): Promise<string> {
  const existing = await getCurrentOrgId(userId)
  if (existing) return existing

  const orgName = userEmail ? `${userEmail.split('@')[0]}'s Business` : 'My Business'
  const orgId = newId()

  await execute('INSERT INTO organizations (id, name, owner_id) VALUES (?, ?, ?)', [
    orgId,
    orgName,
    userId,
  ])
  await execute(
    "INSERT INTO organization_members (id, org_id, user_id, role) VALUES (?, ?, ?, 'owner')",
    [newId(), orgId, userId],
  )
  await execute(
    "INSERT INTO subscriptions (id, org_id, status, plan) VALUES (?, ?, 'trialing', 'starter')",
    [newId(), orgId],
  )

  return orgId
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/auth/signin')

  const orgId = await ensureOrgForUser(session.userId, session.email)

  const sub = await queryOne<{ plan: string }>(
    'SELECT plan FROM subscriptions WHERE org_id = ?',
    [orgId],
  )
  const plan = sub?.plan ?? 'starter'

  const alertCount = await count(
    "SELECT COUNT(*) AS c FROM reviews WHERE org_id = ? AND sentiment = 'negative' AND reply_content IS NULL",
    [orgId],
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <TopBar user={{ email: session.email }} plan={plan} alertCount={alertCount} />
      <main className="ml-64 pt-16 min-h-screen">
        <div className="p-6 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Update `components/TopBar.tsx` imports**

Remove these two lines:
```ts
import { createClient } from '@/lib/supabase/client'
import type { User as SupabaseUser } from '@supabase/supabase-js'
```

- [ ] **Step 3: Change the `TopBarProps` interface**

Replace:
```ts
interface TopBarProps {
  user: SupabaseUser
  plan: string
  alertCount?: number
  title?: string
}
```
with:
```ts
interface TopBarProps {
  user: { email: string }
  plan: string
  alertCount?: number
  title?: string
}
```

- [ ] **Step 4: Replace the `supabase` variable and `handleSignOut` in `TopBar`**

Delete this line inside `TopBar`:
```ts
  const supabase = createClient()
```
Replace the `handleSignOut` function with:
```ts
  async function handleSignOut() {
    await fetch('/api/auth/signout', { method: 'POST' })
    router.push('/auth/signin')
  }
```
(The JSX reference `{user.email}` is unchanged and still valid.)

- [ ] **Step 5: Verify** — Run: `npm run type-check` — Expected: no NEW errors from `app/dashboard/layout.tsx` or `components/TopBar.tsx`.

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/layout.tsx components/TopBar.tsx
git commit -m "feat: rewrite dashboard layout and TopBar for Turso auth"
```

---

## Phase 3 — API routes

### Task 13: Rewrite the businesses (create location) route — reference pattern

**Files:**
- Modify (full rewrite): `app/api/businesses/route.ts`

This is the canonical conversion pattern. Every other route follows the same shape:
`getSession()` → `getCurrentOrgId()` → validate → org-scoped SQL → respond.

- [ ] **Step 1: Replace the entire contents of `app/api/businesses/route.ts`**

```ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { CreateLocationSchema } from '@/lib/validators'
import { getTierLimits, type Plan } from '@/lib/utils'
import { getSession, getCurrentOrgId, newId } from '@/lib/auth'
import { queryOne, execute, count } from '@/lib/db'
import type { Location } from '@/lib/db-types'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = await getCurrentOrgId(session.userId)
    if (!orgId) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = CreateLocationSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 422 },
      )
    }

    const subscription = await queryOne<{ plan: string }>(
      'SELECT plan FROM subscriptions WHERE org_id = ?',
      [orgId],
    )
    const plan = (subscription?.plan ?? 'starter') as Plan
    const limits = getTierLimits(plan)

    const locationCount = await count(
      'SELECT COUNT(*) AS c FROM locations WHERE org_id = ?',
      [orgId],
    )

    if (locationCount >= limits.locations) {
      return NextResponse.json(
        {
          error: `Location limit reached for your ${plan} plan. Upgrade to add more locations.`,
          upgrade: true,
          current_count: locationCount,
          limit: limits.locations,
        },
        { status: 403 },
      )
    }

    const id = newId()
    await execute(
      `INSERT INTO locations (id, org_id, name, address, google_place_id, facebook_page_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        orgId,
        parsed.data.name,
        parsed.data.address ?? null,
        parsed.data.google_place_id ?? null,
        parsed.data.facebook_page_id ?? null,
      ],
    )

    const location = await queryOne<Location>('SELECT * FROM locations WHERE id = ?', [id])

    return NextResponse.json(location, { status: 201 })
  } catch (err) {
    console.error('Unexpected error in POST /api/businesses:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify** — Run: `npm run type-check` — Expected: no NEW errors from `app/api/businesses/route.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/api/businesses/route.ts
git commit -m "feat: convert businesses route to Turso"
```

---

### Task 14: Create the delete-location endpoint

**Files:**
- Create: `app/api/businesses/[id]/route.ts`

Replaces the direct browser delete in `LocationsClient.tsx`. Deletes the location and its child rows in one transaction.

- [ ] **Step 1: Create `app/api/businesses/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { getSession, getCurrentOrgId } from '@/lib/auth'
import { db, queryOne } from '@/lib/db'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = await getCurrentOrgId(session.userId)
    if (!orgId) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const location = await queryOne<{ id: string }>(
      'SELECT id FROM locations WHERE id = ? AND org_id = ?',
      [id, orgId],
    )
    if (!location) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    await db().batch(
      [
        { sql: 'DELETE FROM reviews WHERE location_id = ? AND org_id = ?', args: [id, orgId] },
        { sql: 'DELETE FROM review_requests WHERE location_id = ? AND org_id = ?', args: [id, orgId] },
        { sql: 'DELETE FROM locations WHERE id = ? AND org_id = ?', args: [id, orgId] },
      ],
      'write',
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error in DELETE /api/businesses/[id]:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify** — Run: `npm run type-check` — Expected: no NEW errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/businesses/[id]/route.ts
git commit -m "feat: add delete-location endpoint"
```

---

### Task 15: Create the organization-update endpoint

**Files:**
- Create: `app/api/org/route.ts`

Replaces the direct browser update in `SettingsClient.tsx`.

- [ ] **Step 1: Create `app/api/org/route.ts`**

```ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession, getCurrentOrgId } from '@/lib/auth'
import { execute } from '@/lib/db'

const UpdateOrgSchema = z.object({
  name: z.string().min(1).max(100),
  brand_voice: z.string().min(10).max(500),
})

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = await getCurrentOrgId(session.userId)
    if (!orgId) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = UpdateOrgSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 422 },
      )
    }

    await execute('UPDATE organizations SET name = ?, brand_voice = ? WHERE id = ?', [
      parsed.data.name,
      parsed.data.brand_voice,
      orgId,
    ])

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error in PATCH /api/org:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify** — Run: `npm run type-check` — Expected: no NEW errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/org/route.ts
git commit -m "feat: add organization-update endpoint"
```

---

### Task 16: Create the delete-template endpoint

**Files:**
- Create: `app/api/templates/[id]/route.ts`

Replaces the direct browser delete in `RequestsClient.tsx`.

- [ ] **Step 1: Create `app/api/templates/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { getSession, getCurrentOrgId } from '@/lib/auth'
import { queryOne, execute } from '@/lib/db'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = await getCurrentOrgId(session.userId)
    if (!orgId) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const template = await queryOne<{ id: string }>(
      'SELECT id FROM request_templates WHERE id = ? AND org_id = ?',
      [id, orgId],
    )
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    await execute('DELETE FROM request_templates WHERE id = ? AND org_id = ?', [id, orgId])

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error in DELETE /api/templates/[id]:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify** — Run: `npm run type-check` — Expected: no NEW errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/templates/[id]/route.ts
git commit -m "feat: add delete-template endpoint"
```

---

### Task 17: Create the save-review-reply endpoint

**Files:**
- Create: `app/api/reviews/[id]/reply/route.ts`

Replaces the direct browser update in `AIReplyButton.tsx`.

- [ ] **Step 1: Create `app/api/reviews/[id]/reply/route.ts`**

```ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession, getCurrentOrgId } from '@/lib/auth'
import { queryOne, execute } from '@/lib/db'

const ReplySchema = z.object({
  reply_content: z.string().min(1).max(2000),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = await getCurrentOrgId(session.userId)
    if (!orgId) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = ReplySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 422 },
      )
    }

    const review = await queryOne<{ id: string }>(
      'SELECT id FROM reviews WHERE id = ? AND org_id = ?',
      [id, orgId],
    )
    if (!review) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 })
    }

    await execute('UPDATE reviews SET reply_content = ? WHERE id = ? AND org_id = ?', [
      parsed.data.reply_content,
      id,
      orgId,
    ])

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error in PATCH /api/reviews/[id]/reply:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify** — Run: `npm run type-check` — Expected: no NEW errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/reviews/[id]/reply/route.ts
git commit -m "feat: add save-review-reply endpoint"
```

---

### Task 18: Rewrite the AI draft-response route

**Files:**
- Modify (full rewrite): `app/api/ai/draft-response/route.ts`

- [ ] **Step 1: Replace the entire contents of `app/api/ai/draft-response/route.ts`**

```ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { DraftResponseSchema } from '@/lib/validators'
import { draftReviewResponse } from '@/lib/ai/provider'
import { getSession, getCurrentOrgId, newId } from '@/lib/auth'
import { queryOne, execute, count } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = await getCurrentOrgId(session.userId)
    if (!orgId) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = DraftResponseSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 422 },
      )
    }

    const { review_id, review_text, rating, source } = parsed.data

    // Rate limit: max 20 AI draft requests per hour per org.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const recentDrafts = await count(
      `SELECT COUNT(*) AS c FROM audit_logs
        WHERE org_id = ? AND action = 'ai_draft_generated' AND created_at >= ?`,
      [orgId, oneHourAgo],
    )
    if (recentDrafts >= 20) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Max 20 AI drafts per hour.' },
        { status: 429 },
      )
    }

    const org = await queryOne<{ brand_voice: string | null }>(
      'SELECT brand_voice FROM organizations WHERE id = ?',
      [orgId],
    )
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }
    const brandVoice =
      org.brand_voice ?? 'Professional, friendly, and appreciative of customer feedback.'

    const review = await queryOne<{ id: string }>(
      'SELECT id FROM reviews WHERE id = ? AND org_id = ?',
      [review_id, orgId],
    )
    if (!review) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 })
    }

    let drafts: Awaited<ReturnType<typeof draftReviewResponse>>
    try {
      drafts = await draftReviewResponse(review_text, rating, source, brandVoice)
    } catch (aiErr) {
      console.error('AI draft generation error:', aiErr)
      if (aiErr instanceof SyntaxError) {
        return NextResponse.json(
          { error: 'AI returned an unparseable response. Please try again.' },
          { status: 500 },
        )
      }
      return NextResponse.json(
        { error: 'Failed to generate AI drafts. Please try again.' },
        { status: 500 },
      )
    }

    await execute(
      `INSERT INTO audit_logs (id, org_id, user_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, ?, 'ai_draft_generated', 'review', ?, ?)`,
      [newId(), orgId, session.userId, review_id, JSON.stringify({ rating, source })],
    )

    return NextResponse.json({ drafts })
  } catch (err) {
    console.error('Unexpected error in POST /api/ai/draft-response:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify** — Run: `npm run type-check` — Expected: no NEW errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/ai/draft-response/route.ts
git commit -m "feat: convert AI draft-response route to Turso"
```

---

### Task 19: Rewrite the alerts route

**Files:**
- Modify (full rewrite): `app/api/alerts/route.ts`

- [ ] **Step 1: Replace the entire contents of `app/api/alerts/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { getSession, getCurrentOrgId } from '@/lib/auth'
import { queryMany } from '@/lib/db'
import type { Review } from '@/lib/db-types'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = await getCurrentOrgId(session.userId)
    if (!orgId) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const alerts = await queryMany<Review>(
      `SELECT * FROM reviews
        WHERE org_id = ? AND sentiment = 'negative' AND reply_content IS NULL
        ORDER BY synced_at DESC
        LIMIT 50`,
      [orgId],
    )

    return NextResponse.json({ alerts, count: alerts.length })
  } catch (err) {
    console.error('Unexpected error in GET /api/alerts:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify** — Run: `npm run type-check` — Expected: no NEW errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/alerts/route.ts
git commit -m "feat: convert alerts route to Turso"
```

---

### Task 20: Rewrite the requests/send route

**Files:**
- Modify (full rewrite): `app/api/requests/send/route.ts`

- [ ] **Step 1: Replace the entire contents of `app/api/requests/send/route.ts`**

```ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SendRequestSchema } from '@/lib/validators'
import { getTierLimits, type Plan } from '@/lib/utils'
import { sendReviewRequestEmail } from '@/lib/email'
import { sendReviewRequestSMS } from '@/lib/sms'
import { getSession, getCurrentOrgId, newId } from '@/lib/auth'
import { queryOne, execute, count } from '@/lib/db'
import type { RequestTemplate, Location } from '@/lib/db-types'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = await getCurrentOrgId(session.userId)
    if (!orgId) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = SendRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 422 },
      )
    }

    const { customer_name, customer_phone, customer_email, template_id, location_id } =
      parsed.data

    const subscription = await queryOne<{ plan: string }>(
      'SELECT plan FROM subscriptions WHERE org_id = ?',
      [orgId],
    )
    const plan = (subscription?.plan ?? 'starter') as Plan
    const limits = getTierLimits(plan)

    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const monthlyCount = await count(
      'SELECT COUNT(*) AS c FROM review_requests WHERE org_id = ? AND sent_at >= ?',
      [orgId, startOfMonth.toISOString()],
    )

    if (plan !== 'agency' && monthlyCount >= limits.requestsPerMonth) {
      return NextResponse.json(
        {
          error: 'Monthly request limit reached',
          upgrade: true,
          current_count: monthlyCount,
          limit: limits.requestsPerMonth,
        },
        { status: 403 },
      )
    }

    const template = await queryOne<RequestTemplate & { active: number }>(
      'SELECT * FROM request_templates WHERE id = ? AND org_id = ?',
      [template_id, orgId],
    )
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    const location = await queryOne<Location>(
      'SELECT * FROM locations WHERE id = ? AND org_id = ?',
      [location_id, orgId],
    )
    if (!location) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    const reviewLink = location.google_place_id
      ? `https://search.google.com/local/writereview?placeid=${location.google_place_id}`
      : `${process.env.NEXT_PUBLIC_APP_URL}/review/${location_id}`

    if (customer_phone && limits.sms) {
      try {
        await sendReviewRequestSMS(
          customer_phone,
          customer_name,
          location.name,
          reviewLink,
          template.sms_body ?? undefined,
        )
      } catch (smsErr) {
        console.error('SMS send failed:', smsErr)
      }
    }

    if (customer_email) {
      try {
        await sendReviewRequestEmail(customer_email, customer_name, location.name, reviewLink)
      } catch (emailErr) {
        console.error('Email send failed:', emailErr)
      }
    }

    const requestId = newId()
    await execute(
      `INSERT INTO review_requests
         (id, org_id, location_id, template_id, customer_name, customer_phone, customer_email, status, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'sent', ?)`,
      [
        requestId,
        orgId,
        location_id,
        template_id,
        customer_name,
        customer_phone ?? null,
        customer_email ?? null,
        new Date().toISOString(),
      ],
    )

    await execute(
      `INSERT INTO audit_logs (id, org_id, user_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, ?, 'review_request_sent', 'review_request', ?, ?)`,
      [
        newId(),
        orgId,
        session.userId,
        requestId,
        JSON.stringify({ customer_name, location_id, template_id }),
      ],
    )

    return NextResponse.json({ success: true, request_id: requestId })
  } catch (err) {
    console.error('Unexpected error in POST /api/requests/send:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify** — Run: `npm run type-check` — Expected: no NEW errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/requests/send/route.ts
git commit -m "feat: convert requests/send route to Turso"
```

---

### Task 21: Rewrite the review-sync library

**Files:**
- Modify (full rewrite): `lib/review-sync.ts`

The `supabase` parameter is removed from every function — they use the `lib/db` helpers directly.

- [ ] **Step 1: Replace the entire contents of `lib/review-sync.ts`**

```ts
import { classifySentiment } from './ai/provider'
import { queryMany, execute } from '@/lib/db'
import { newId } from '@/lib/auth'

interface GoogleReview {
  author_name: string
  rating: number
  text: string
  time: number
}

export async function syncGoogleReviews(
  locationId: string,
  orgId: string,
  googlePlaceId: string,
): Promise<number> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return 0

  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${googlePlaceId}&fields=reviews&key=${apiKey}`
  const res = await fetch(url)
  if (!res.ok) return 0

  const data = (await res.json()) as { result?: { reviews?: GoogleReview[] } }
  const reviews = data.result?.reviews ?? []

  let synced = 0
  for (const r of reviews) {
    const sentiment = classifySentiment(r.rating, r.text)
    const postedAt = new Date(r.time * 1000).toISOString()

    const result = await execute(
      `INSERT INTO reviews
         (id, location_id, org_id, source, author_name, rating, content, sentiment, posted_at)
       VALUES (?, ?, ?, 'google', ?, ?, ?, ?, ?)
       ON CONFLICT(location_id, source, author_name, posted_at) DO NOTHING`,
      [newId(), locationId, orgId, r.author_name, r.rating, r.text, sentiment, postedAt],
    )
    if (result.rowsAffected > 0) synced++
  }

  if (synced > 0) await updateLocationStats(locationId)
  return synced
}

export async function syncFacebookReviews(
  locationId: string,
  orgId: string,
  pageId: string,
): Promise<number> {
  const accessToken = process.env.FACEBOOK_ACCESS_TOKEN
  if (!accessToken) return 0

  const url = `https://graph.facebook.com/v18.0/${pageId}/ratings?fields=reviewer,rating,review_text,created_time&access_token=${accessToken}`
  const res = await fetch(url)
  if (!res.ok) return 0

  const data = (await res.json()) as {
    data?: Array<{
      reviewer: { name: string }
      rating: number
      review_text: string
      created_time: string
    }>
  }

  let synced = 0
  for (const r of data.data ?? []) {
    const sentiment = classifySentiment(r.rating, r.review_text)

    const result = await execute(
      `INSERT INTO reviews
         (id, location_id, org_id, source, author_name, rating, content, sentiment, posted_at)
       VALUES (?, ?, ?, 'facebook', ?, ?, ?, ?, ?)
       ON CONFLICT(location_id, source, author_name, posted_at) DO NOTHING`,
      [
        newId(),
        locationId,
        orgId,
        r.reviewer.name,
        r.rating,
        r.review_text,
        sentiment,
        r.created_time,
      ],
    )
    if (result.rowsAffected > 0) synced++
  }

  if (synced > 0) await updateLocationStats(locationId)
  return synced
}

async function updateLocationStats(locationId: string): Promise<void> {
  const rows = await queryMany<{ rating: number | null }>(
    'SELECT rating FROM reviews WHERE location_id = ? AND rating IS NOT NULL',
    [locationId],
  )
  if (rows.length === 0) return

  const avg = rows.reduce((sum, r) => sum + (r.rating ?? 0), 0) / rows.length
  await execute('UPDATE locations SET rating_avg = ?, review_count = ? WHERE id = ?', [
    Math.round(avg * 100) / 100,
    rows.length,
    locationId,
  ])
}
```

- [ ] **Step 2: Verify** — Run: `npm run type-check` — Expected: errors only in `app/api/reviews/sync/route.ts` (it still calls the old signature; fixed in the next task).

- [ ] **Step 3: Commit**

```bash
git add lib/review-sync.ts
git commit -m "feat: convert review-sync library to Turso"
```

---

### Task 22: Rewrite the reviews/sync route

**Files:**
- Modify (full rewrite): `app/api/reviews/sync/route.ts`

Note: there is no longer a service-role client. Cron mode (authorized by `CRON_SECRET`) syncs all locations; user mode syncs only the caller's org. The negative-review alert reads the owner's email from the `users` table.

- [ ] **Step 1: Replace the entire contents of `app/api/reviews/sync/route.ts`**

```ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SyncReviewsSchema } from '@/lib/validators'
import { syncGoogleReviews, syncFacebookReviews } from '@/lib/review-sync'
import { sendNegativeReviewAlert } from '@/lib/email'
import { getSession, getCurrentOrgId } from '@/lib/auth'
import { queryMany, queryOne } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`

    let orgId: string | null = null
    if (!isCron) {
      const session = await getSession()
      if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      orgId = await getCurrentOrgId(session.userId)
      if (!orgId) {
        return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
      }
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      body = {}
    }

    const parsed = SyncReviewsSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 422 },
      )
    }

    const { location_id } = parsed.data

    // Build the locations query — cron syncs all orgs, users only their own.
    let locationsSql =
      'SELECT id, org_id, google_place_id, facebook_page_id FROM locations'
    const locationsArgs: string[] = []
    const where: string[] = []
    if (!isCron) {
      where.push('org_id = ?')
      locationsArgs.push(orgId as string)
    }
    if (location_id) {
      where.push('id = ?')
      locationsArgs.push(location_id)
    }
    if (where.length > 0) locationsSql += ' WHERE ' + where.join(' AND ')

    const locations = await queryMany<{
      id: string
      org_id: string
      google_place_id: string | null
      facebook_page_id: string | null
    }>(locationsSql, locationsArgs)

    let totalSynced = 0
    for (const loc of locations) {
      if (loc.google_place_id) {
        totalSynced += await syncGoogleReviews(loc.id, loc.org_id, loc.google_place_id)
      }
      if (loc.facebook_page_id) {
        totalSynced += await syncFacebookReviews(loc.id, loc.org_id, loc.facebook_page_id)
      }
    }

    // Send alerts for negative reviews without replies.
    if (locations.length > 0) {
      const locationIds = locations.map((l) => l.id)
      const placeholders = locationIds.map(() => '?').join(', ')
      const negativeReviews = await queryMany<{
        id: string
        org_id: string
        author_name: string | null
        rating: number | null
        content: string | null
        source: string | null
      }>(
        `SELECT id, org_id, author_name, rating, content, source
           FROM reviews
          WHERE location_id IN (${placeholders})
            AND rating <= 2 AND sentiment = 'negative' AND reply_content IS NULL`,
        locationIds,
      )

      for (const review of negativeReviews) {
        const owner = await queryOne<{ name: string; email: string }>(
          `SELECT o.name AS name, u.email AS email
             FROM organizations o
             JOIN users u ON u.id = o.owner_id
            WHERE o.id = ?`,
          [review.org_id],
        )
        if (!owner?.email) continue

        try {
          await sendNegativeReviewAlert(
            owner.email,
            owner.name,
            review.author_name ?? 'Anonymous',
            review.rating ?? 0,
            review.content ?? '',
            review.source ?? 'unknown',
          )
        } catch (alertErr) {
          console.error('Failed to send negative review alert:', alertErr)
        }
      }
    }

    return NextResponse.json({ synced: totalSynced, locations: locations.length })
  } catch (err) {
    console.error('Unexpected error in POST /api/reviews/sync:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify** — Run: `npm run type-check` — Expected: no NEW errors from `app/api/reviews/sync/route.ts` or `lib/review-sync.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/api/reviews/sync/route.ts
git commit -m "feat: convert reviews/sync route to Turso"
```

---

### Task 23: Rewrite the Stripe checkout route

**Files:**
- Modify (full rewrite): `app/api/stripe/checkout/route.ts`

The user's email now comes from `getSession()`. The `subscriptions` upsert uses SQLite `ON CONFLICT(org_id)`.

- [ ] **Step 1: Replace the entire contents of `app/api/stripe/checkout/route.ts`**

```ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { stripe, PRICE_IDS } from '@/lib/stripe/client'
import { getSession, getCurrentOrgId, newId } from '@/lib/auth'
import { queryOne, execute } from '@/lib/db'

const CheckoutSchema = z.object({
  plan: z.enum(['starter', 'pro', 'agency']),
  interval: z.enum(['monthly', 'yearly']),
})

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = await getCurrentOrgId(session.userId)
    if (!orgId) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = CheckoutSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 422 },
      )
    }

    const { plan, interval } = parsed.data
    const priceId = PRICE_IDS[plan][interval]
    if (!priceId) {
      return NextResponse.json({ error: 'Invalid plan or interval' }, { status: 400 })
    }

    const existingSubscription = await queryOne<{ stripe_customer_id: string | null }>(
      'SELECT stripe_customer_id FROM subscriptions WHERE org_id = ?',
      [orgId],
    )

    let customerId: string
    if (existingSubscription?.stripe_customer_id) {
      customerId = existingSubscription.stripe_customer_id
    } else {
      const customer = await stripe.customers.create({
        email: session.email,
        metadata: { org_id: orgId },
      })
      customerId = customer.id

      await execute(
        `INSERT INTO subscriptions (id, org_id, stripe_customer_id, plan, status, updated_at)
         VALUES (?, ?, ?, 'starter', 'incomplete', ?)
         ON CONFLICT(org_id) DO UPDATE SET
           stripe_customer_id = excluded.stripe_customer_id,
           updated_at = excluded.updated_at`,
        [newId(), orgId, customerId, new Date().toISOString()],
      )
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?canceled=true`,
      metadata: { org_id: orgId },
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (err) {
    console.error('Unexpected error in POST /api/stripe/checkout:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify** — Run: `npm run type-check` — Expected: no NEW errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/stripe/checkout/route.ts
git commit -m "feat: convert Stripe checkout route to Turso"
```

---

### Task 24: Rewrite the Stripe portal route

**Files:**
- Modify (full rewrite): `app/api/stripe/portal/route.ts`

- [ ] **Step 1: Replace the entire contents of `app/api/stripe/portal/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/client'
import { getSession, getCurrentOrgId } from '@/lib/auth'
import { queryOne } from '@/lib/db'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = await getCurrentOrgId(session.userId)
    if (!orgId) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const subscription = await queryOne<{ stripe_customer_id: string | null }>(
      'SELECT stripe_customer_id FROM subscriptions WHERE org_id = ?',
      [orgId],
    )

    if (!subscription?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No billing account found. Please subscribe to a plan first.' },
        { status: 404 },
      )
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings`,
    })

    return NextResponse.redirect(portal.url)
  } catch (err) {
    console.error('Unexpected error in GET /api/stripe/portal:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify** — Run: `npm run type-check` — Expected: no NEW errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/stripe/portal/route.ts
git commit -m "feat: convert Stripe portal route to Turso"
```

---

### Task 25: Rewrite the Stripe webhook route

**Files:**
- Modify (full rewrite): `app/api/webhooks/stripe/route.ts`

The webhook is unauthenticated by session (Stripe signature verifies it). The `subscriptions` upsert uses `ON CONFLICT(org_id)`; updates target `stripe_subscription_id`.

- [ ] **Step 1: Replace the entire contents of `app/api/webhooks/stripe/route.ts`**

```ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type Stripe from 'stripe'
import { stripe, getPlanFromPriceId } from '@/lib/stripe/client'
import { execute } from '@/lib/db'
import { newId } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')
  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Stripe webhook signature verification failed:', message)
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const orgId = session.metadata?.org_id
        const subscriptionId = session.subscription as string

        if (!orgId || !subscriptionId) {
          console.error('checkout.session.completed: missing org_id or subscription_id', session.id)
          break
        }

        const sub = await stripe.subscriptions.retrieve(subscriptionId)
        const plan = getPlanFromPriceId(sub.items.data[0].price.id)

        await execute(
          `INSERT INTO subscriptions
             (id, org_id, stripe_subscription_id, stripe_customer_id, status, plan, current_period_end, updated_at)
           VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
           ON CONFLICT(org_id) DO UPDATE SET
             stripe_subscription_id = excluded.stripe_subscription_id,
             stripe_customer_id     = excluded.stripe_customer_id,
             status                 = excluded.status,
             plan                   = excluded.plan,
             current_period_end     = excluded.current_period_end,
             updated_at             = excluded.updated_at`,
          [
            newId(),
            orgId,
            subscriptionId,
            session.customer as string,
            plan,
            new Date(sub.current_period_end * 1000).toISOString(),
            new Date().toISOString(),
          ],
        )
        break
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const plan = getPlanFromPriceId(sub.items.data[0].price.id)

        await execute(
          `UPDATE subscriptions
              SET status = ?, plan = ?, current_period_end = ?, updated_at = ?
            WHERE stripe_subscription_id = ?`,
          [
            sub.status,
            plan,
            new Date(sub.current_period_end * 1000).toISOString(),
            new Date().toISOString(),
            sub.id,
          ],
        )
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        await execute(
          'UPDATE subscriptions SET status = ?, updated_at = ? WHERE stripe_subscription_id = ?',
          ['inactive', new Date().toISOString(), sub.id],
        )
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        await execute(
          'UPDATE subscriptions SET status = ?, updated_at = ? WHERE stripe_subscription_id = ?',
          ['past_due', new Date().toISOString(), invoice.subscription as string],
        )
        break
      }

      default:
        console.log(`Unhandled Stripe event type: ${event.type}`)
    }
  } catch (handlerErr) {
    console.error(`Error handling Stripe event ${event.type}:`, handlerErr)
    return NextResponse.json({ received: true, warning: 'Handler error logged' })
  }

  return NextResponse.json({ received: true })
}
```

- [ ] **Step 2: Verify** — Run: `npm run type-check` — Expected: no NEW errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/webhooks/stripe/route.ts
git commit -m "feat: convert Stripe webhook route to Turso"
```

---

## Phase 4 — Dashboard pages and client components

Each dashboard page is a server component. Only the imports and the async data-fetching block (from the top of the default-export function down to the `return (`) change. The JSX `return` block and any helper functions below it are **unchanged** — do not modify them.

### Task 26: Convert dashboard pages — overview, locations, requests

**Files:**
- Modify: `app/dashboard/page.tsx`
- Modify: `app/dashboard/locations/page.tsx`
- Modify: `app/dashboard/requests/page.tsx`

- [ ] **Step 1: `app/dashboard/page.tsx` — replace imports and data block**

This file has two non-adjacent Supabase import lines. Replace the line
`import { createClient } from '@/lib/supabase/server'` with these three lines:
```ts
import { redirect } from 'next/navigation'
import { getSession, getCurrentOrgId } from '@/lib/auth'
import { queryMany, count } from '@/lib/db'
```
And replace the line `import type { Review } from '@/lib/supabase/types'` with:
```ts
import type { Review } from '@/lib/db-types'
```

Replace everything from `const supabase = await createClient()` down to (but NOT including) the line `const ratings = (ratingData ?? []) as Array<{ rating: number | null }>` with:
```ts
  const session = await getSession()
  if (!session) redirect('/auth/signin')
  const orgId = await getCurrentOrgId(session.userId)
  if (!orgId) return <p className="text-sm text-gray-500">Setting up your organization…</p>

  const [locations, reviewCount, ratingData, recentReviews, negativeReviews, requestsThisMonth] =
    await Promise.all([
      queryMany<{ id: string; name: string; rating_avg: number | null; review_count: number }>(
        'SELECT id, name, rating_avg, review_count FROM locations WHERE org_id = ?',
        [orgId],
      ),
      count('SELECT COUNT(*) AS c FROM reviews WHERE org_id = ?', [orgId]),
      queryMany<{ rating: number | null }>(
        'SELECT rating FROM reviews WHERE org_id = ? AND rating IS NOT NULL',
        [orgId],
      ),
      queryMany<Review>(
        'SELECT * FROM reviews WHERE org_id = ? ORDER BY posted_at DESC NULLS LAST LIMIT 5',
        [orgId],
      ),
      queryMany<Review>(
        `SELECT * FROM reviews
          WHERE org_id = ? AND sentiment = 'negative' AND reply_content IS NULL
          LIMIT 20`,
        [orgId],
      ),
      count('SELECT COUNT(*) AS c FROM review_requests WHERE org_id = ? AND sent_at >= ?', [
        orgId,
        startOfMonthISO(),
      ]),
    ])
```

The JSX below still references `locations`, `reviewCount`, `ratingData`, `recentReviews`, `negativeReviews`, `requestsThisMonth`. These are now plain arrays/numbers rather than `{ data }`/`{ count }` wrappers. Update the JSX references as follows:
- `(ratingData ?? [])` → `ratingData` (it is already an array; the existing `const ratings = (ratingData ?? []) ...` line still works, leave it).
- `reviewCount ?? 0` → `reviewCount` (already a number; leave the `?? 0` — harmless).
- `requestsThisMonth ?? 0` → `requestsThisMonth` (leave the `?? 0` — harmless).
- `locations?.length ?? 0` and `(locations ?? [])` → still valid (arrays). Leave as-is.
- `(recentReviews ?? [])` and `(negativeReviews ?? [])` → still valid. Leave as-is.

No further JSX edits needed — the `?? []` / `?? 0` fallbacks remain valid against arrays/numbers. The `startOfMonthISO()` helper at the bottom of the file is unchanged.

- [ ] **Step 2: `app/dashboard/locations/page.tsx` — replace full file**

```tsx
import { redirect } from 'next/navigation'
import { getSession, getCurrentOrgId } from '@/lib/auth'
import { queryMany, queryOne } from '@/lib/db'
import { LocationsClient } from './LocationsClient'
import type { Location } from '@/lib/db-types'

export const dynamic = 'force-dynamic'

export default async function LocationsPage() {
  const session = await getSession()
  if (!session) redirect('/auth/signin')
  const orgId = await getCurrentOrgId(session.userId)
  if (!orgId) return <p className="text-sm text-gray-500">Loading…</p>

  const [locations, sub] = await Promise.all([
    queryMany<Location>(
      'SELECT * FROM locations WHERE org_id = ? ORDER BY created_at DESC',
      [orgId],
    ),
    queryOne<{ plan: string }>('SELECT plan FROM subscriptions WHERE org_id = ?', [orgId]),
  ])

  return (
    <LocationsClient
      initialLocations={locations}
      plan={(sub?.plan ?? 'starter') as 'starter' | 'pro' | 'agency'}
    />
  )
}
```

- [ ] **Step 3: `app/dashboard/requests/page.tsx` — replace full file**

Note: `request_templates.active` is stored as INTEGER 0/1; it is converted to boolean here so `RequestTemplate` (which has `active: boolean`) is satisfied.

```tsx
import { redirect } from 'next/navigation'
import { getSession, getCurrentOrgId } from '@/lib/auth'
import { queryMany, queryOne } from '@/lib/db'
import { RequestsClient } from './RequestsClient'
import type { RequestTemplate, ReviewRequest, Location } from '@/lib/db-types'

export const dynamic = 'force-dynamic'

export default async function RequestsPage() {
  const session = await getSession()
  if (!session) redirect('/auth/signin')
  const orgId = await getCurrentOrgId(session.userId)
  if (!orgId) return <p className="text-sm text-gray-500">Loading…</p>

  const [templateRows, recent, locations, sub] = await Promise.all([
    queryMany<Omit<RequestTemplate, 'active'> & { active: number }>(
      'SELECT * FROM request_templates WHERE org_id = ? ORDER BY created_at DESC',
      [orgId],
    ),
    queryMany<ReviewRequest>(
      'SELECT * FROM review_requests WHERE org_id = ? ORDER BY created_at DESC LIMIT 50',
      [orgId],
    ),
    queryMany<Pick<Location, 'id' | 'name'>>(
      'SELECT id, name FROM locations WHERE org_id = ?',
      [orgId],
    ),
    queryOne<{ plan: string }>('SELECT plan FROM subscriptions WHERE org_id = ?', [orgId]),
  ])

  const templates: RequestTemplate[] = templateRows.map((t) => ({
    ...t,
    active: t.active === 1,
  }))

  return (
    <RequestsClient
      initialTemplates={templates}
      recentRequests={recent}
      locations={locations}
      plan={(sub?.plan ?? 'starter') as 'starter' | 'pro' | 'agency'}
    />
  )
}
```

- [ ] **Step 4: Verify** — Run: `npm run type-check` — Expected: no NEW errors from these three pages.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/page.tsx app/dashboard/locations/page.tsx app/dashboard/requests/page.tsx
git commit -m "feat: convert overview/locations/requests pages to Turso"
```

---

### Task 27: Convert dashboard pages — inbox, analytics, settings

**Files:**
- Modify: `app/dashboard/inbox/page.tsx`
- Modify: `app/dashboard/analytics/page.tsx`
- Modify: `app/dashboard/settings/page.tsx`

- [ ] **Step 1: `app/dashboard/inbox/page.tsx` — replace full file**

```tsx
import { redirect } from 'next/navigation'
import { getSession, getCurrentOrgId } from '@/lib/auth'
import { queryMany, queryOne } from '@/lib/db'
import { InboxClient } from './InboxClient'
import type { Review } from '@/lib/db-types'

export const dynamic = 'force-dynamic'

export default async function InboxPage() {
  const session = await getSession()
  if (!session) redirect('/auth/signin')
  const orgId = await getCurrentOrgId(session.userId)
  if (!orgId) return <p className="text-sm text-gray-500">Loading…</p>

  const [reviews, org, locations] = await Promise.all([
    queryMany<Review>(
      'SELECT * FROM reviews WHERE org_id = ? ORDER BY posted_at DESC NULLS LAST LIMIT 200',
      [orgId],
    ),
    queryOne<{ brand_voice: string | null }>(
      'SELECT brand_voice FROM organizations WHERE id = ?',
      [orgId],
    ),
    queryMany<{ id: string; name: string }>(
      'SELECT id, name FROM locations WHERE org_id = ?',
      [orgId],
    ),
  ])

  return (
    <InboxClient
      initialReviews={reviews}
      brandVoice={org?.brand_voice ?? 'Friendly and professional.'}
      locations={locations}
    />
  )
}
```

Note: `InboxClient.tsx` imports `type { Review } from '@/lib/supabase/types'` — Task 28 updates that import path.

- [ ] **Step 2: `app/dashboard/analytics/page.tsx` — replace imports and data block**

Replace the import line:
```ts
import { createClient } from '@/lib/supabase/server'
```
with:
```ts
import { redirect } from 'next/navigation'
import { getSession, getCurrentOrgId } from '@/lib/auth'
import { queryMany, queryOne } from '@/lib/db'
```

Replace everything from `const supabase = await createClient()` down to (but NOT including) the line `const rows = (reviews ?? []) as SentimentRow[]` with:
```ts
  const session = await getSession()
  if (!session) redirect('/auth/signin')
  const orgId = await getCurrentOrgId(session.userId)
  if (!orgId) return <p className="text-sm text-gray-500">Loading…</p>

  const sub = await queryOne<{ plan: string }>(
    'SELECT plan FROM subscriptions WHERE org_id = ?',
    [orgId],
  )
  const plan = (sub?.plan ?? 'starter') as 'starter' | 'pro' | 'agency'
  const limits = getTierLimits(plan)

  if (!limits.sentimentAnalytics) {
    return <SentimentLocked currentPlan={plan} />
  }

  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const reviews = await queryMany<SentimentRow>(
    `SELECT sentiment, posted_at, rating FROM reviews
      WHERE org_id = ? AND posted_at >= ?
      ORDER BY posted_at ASC`,
    [orgId, ninetyDaysAgo.toISOString()],
  )
```

The existing line `const rows = (reviews ?? []) as SentimentRow[]` stays valid (`reviews` is now an array; the cast is harmless). All JSX and helper functions below are unchanged.

- [ ] **Step 3: `app/dashboard/settings/page.tsx` — replace full file**

```tsx
import { redirect } from 'next/navigation'
import { getSession, getCurrentOrgId } from '@/lib/auth'
import { queryMany, queryOne } from '@/lib/db'
import { SettingsClient } from './SettingsClient'
import type { Organization, Subscription } from '@/lib/db-types'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const session = await getSession()
  if (!session) redirect('/auth/signin')
  const orgId = await getCurrentOrgId(session.userId)
  if (!orgId) return <p className="text-sm text-gray-500">Loading…</p>

  const [org, sub, members] = await Promise.all([
    queryOne<Organization>('SELECT * FROM organizations WHERE id = ?', [orgId]),
    queryOne<Subscription>('SELECT * FROM subscriptions WHERE org_id = ?', [orgId]),
    queryMany<{ id: string; user_id: string; role: string }>(
      'SELECT id, user_id, role FROM organization_members WHERE org_id = ?',
      [orgId],
    ),
  ])

  return (
    <SettingsClient
      email={session.email}
      orgName={org?.name ?? ''}
      brandVoice={org?.brand_voice ?? ''}
      plan={(sub?.plan ?? 'starter') as 'starter' | 'pro' | 'agency'}
      status={sub?.status ?? 'trialing'}
      memberCount={members.length || 1}
      currentPeriodEnd={sub?.current_period_end ?? null}
    />
  )
}
```

- [ ] **Step 4: Verify** — Run: `npm run type-check` — Expected: errors only from the four client components fixed in Task 28 (`InboxClient`, `LocationsClient`, `SettingsClient`, `RequestsClient`, `AIReplyButton`, `AlertBanner` still import `@/lib/supabase/types`).

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/inbox/page.tsx app/dashboard/analytics/page.tsx app/dashboard/settings/page.tsx
git commit -m "feat: convert inbox/analytics/settings pages to Turso"
```

---

### Task 28: Update client components

**Files:**
- Modify: `app/dashboard/locations/LocationsClient.tsx`
- Modify: `app/dashboard/settings/SettingsClient.tsx`
- Modify: `app/dashboard/requests/RequestsClient.tsx`
- Modify: `components/AIReplyButton.tsx`
- Modify: `app/dashboard/inbox/InboxClient.tsx`
- Modify: `components/AlertBanner.tsx`

For each component: change the type import path from `@/lib/supabase/types` to `@/lib/db-types`, remove the browser Supabase client, and replace direct DB calls with `fetch` to the new endpoints.

- [ ] **Step 1: `LocationsClient.tsx`**

Change the type import:
```ts
import type { Location } from '@/lib/supabase/types'
```
→
```ts
import type { Location } from '@/lib/db-types'
```
Remove this import line:
```ts
import { createClient } from '@/lib/supabase/client'
```
Remove this line inside `LocationsClient`:
```ts
  const supabase = createClient()
```
Replace the `handleDelete` function with:
```ts
  async function handleDelete(id: string) {
    if (!confirm('Delete this location? Reviews and request history will also be removed.')) return
    const res = await fetch(`/api/businesses/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert('Failed to delete: ' + (data.error ?? 'Unknown error'))
      return
    }
    setLocations((prev) => prev.filter((l) => l.id !== id))
  }
```

- [ ] **Step 2: `SettingsClient.tsx`**

Remove this import line:
```ts
import { createClient } from '@/lib/supabase/client'
```
Remove this line inside `SettingsClient`:
```ts
  const supabase = createClient()
```
Replace the `handleSaveProfile` function with:
```ts
  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    setSavingProfile(true)
    setProfileSaved(false)
    setProfileError(null)
    try {
      const res = await fetch('/api/org', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: orgName, brand_voice: brandVoice }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to save')
      }
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 3000)
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSavingProfile(false)
    }
  }
```

- [ ] **Step 3: `RequestsClient.tsx`**

Change the type import:
```ts
import type { RequestTemplate, ReviewRequest, Location } from '@/lib/supabase/types'
```
→
```ts
import type { RequestTemplate, ReviewRequest, Location } from '@/lib/db-types'
```
Remove this import line:
```ts
import { createClient } from '@/lib/supabase/client'
```
Remove this line inside `RequestsClient`:
```ts
  const supabase = createClient()
```
Replace the `handleDelete` function with:
```ts
  async function handleDelete(id: string) {
    if (!confirm('Delete this template?')) return
    const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert('Failed: ' + (data.error ?? 'Unknown error'))
      return
    }
    setTemplates((prev) => prev.filter((t) => t.id !== id))
  }
```

- [ ] **Step 4: `components/AIReplyButton.tsx`**

Change the type import:
```ts
import type { Review } from '@/lib/supabase/types'
```
→
```ts
import type { Review } from '@/lib/db-types'
```
Remove this import line:
```ts
import { createClient } from '@/lib/supabase/client'
```
Remove this line inside `AIReplyButton`:
```ts
  const supabase = createClient()
```
Replace the `handleSubmit` function with:
```ts
  async function handleSubmit() {
    if (!editedText.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/reviews/${review.id}/reply`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply_content: editedText.trim() }),
      })
      if (!res.ok) throw new Error('Failed to save reply')
      onReplySubmitted?.(review.id, editedText.trim())
      setOpen(false)
    } catch {
      setError('Failed to save reply. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }
```

- [ ] **Step 5: `app/dashboard/inbox/InboxClient.tsx`**

Change the type import:
```ts
import type { Review } from '@/lib/supabase/types'
```
→
```ts
import type { Review } from '@/lib/db-types'
```
(InboxClient has no direct DB calls — only this import path changes.)

- [ ] **Step 6: `components/AlertBanner.tsx`**

Change the type import:
```ts
import type { Review } from '@/lib/supabase/types'
```
→
```ts
import type { Review } from '@/lib/db-types'
```
(AlertBanner has no direct DB calls — only this import path changes.)

- [ ] **Step 7: Verify** — Run: `npm run type-check` — Expected: no NEW errors from any of the six components. The only remaining errors should be from files still importing `@/lib/supabase/*` that no longer exist — confirm there are none by running: `npm run type-check` and checking output mentions no `lib/supabase`.

- [ ] **Step 8: Commit**

```bash
git add app/dashboard/locations/LocationsClient.tsx app/dashboard/settings/SettingsClient.tsx app/dashboard/requests/RequestsClient.tsx components/AIReplyButton.tsx app/dashboard/inbox/InboxClient.tsx components/AlertBanner.tsx
git commit -m "feat: client components use server endpoints instead of browser DB"
```

---

## Phase 5 — Cleanup and verification

### Task 29: Remove Supabase files and update env example

**Files:**
- Delete: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/types.ts`
- Delete: `supabase/migrations/001_schema.sql` (and the `supabase/` directory if empty)
- Modify: `.env.example`

- [ ] **Step 1: Confirm nothing still imports `@/lib/supabase`**

Run: `grep -rn "lib/supabase" app components lib` (PowerShell: `Select-String -Path app,components,lib -Pattern "lib/supabase" -Recurse`)
Expected: no matches. If there are matches, fix those files before deleting.

- [ ] **Step 2: Delete the Supabase files**

```bash
git rm lib/supabase/client.ts lib/supabase/server.ts lib/supabase/types.ts
git rm supabase/migrations/001_schema.sql
```

- [ ] **Step 3: Replace `.env.example`**

```
# Turso (database)
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-turso-auth-token

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER_MONTHLY=price_...
STRIPE_PRICE_STARTER_YEARLY=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_YEARLY=price_...
STRIPE_PRICE_AGENCY_MONTHLY=price_...
STRIPE_PRICE_AGENCY_YEARLY=price_...

# Resend (transactional + magic-link sign-in emails — required)
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@yourdomain.com

# Twilio (SMS — Pro + Agency)
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...

# App
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
CRON_SECRET=your-random-secret-here

# Optional integrations
GOOGLE_MAPS_API_KEY=AIza...
FACEBOOK_ACCESS_TOKEN=...
```

- [ ] **Step 4: Verify** — Run: `npm run type-check` — Expected: passes with no errors.

- [ ] **Step 5: Commit**

```bash
git add .env.example lib/supabase supabase
git commit -m "chore: remove Supabase files after Turso migration"
```

---

### Task 30: Full verification and functional testing

**Files:** none (verification only)

- [ ] **Step 1: Type-check**

Run: `npm run type-check`
Expected: PASS, no errors.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: PASS (no errors; pre-existing warnings acceptable).

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build completes successfully.

- [ ] **Step 4: Functional test — sign-in flow**

Start the dev server (`npm run dev`) and, using the preview tooling:
1. Open `/auth/signin`, enter an email, submit. Expect the "Check your email" confirmation.
2. Confirm a sign-in email arrives via Resend. Open the link.
3. Expect to land on `/dashboard` signed in (an organization is auto-created on first visit).
4. Use the TopBar menu → Sign out. Expect redirect to `/auth/signin`.
5. Visit `/dashboard` while signed out — expect redirect to `/auth/signin`.

- [ ] **Step 5: Functional test — each dashboard screen**

While signed in, verify each screen loads without console/server errors:
- **Locations** — add a location; delete a location.
- **Overview** — stat cards render.
- **Review Inbox** — loads (empty is fine).
- **Requests** — loads; delete a template if one exists.
- **Analytics** — loads (shows the upgrade-locked state on the starter plan — expected).
- **Settings** — edit organization name + brand voice, save; expect the "Saved" confirmation.

- [ ] **Step 6: Functional test — organization isolation**

Sign out, sign in with a *second*, different email. Confirm the second account sees an empty dashboard — none of the first account's locations or settings. This verifies app-level org scoping.

- [ ] **Step 7: Final commit (if any verification fixes were made)**

```bash
git add -A
git commit -m "fix: address issues found during migration verification"
```

If no fixes were needed, skip this step.

---

## Self-review notes

- **Spec coverage:** Schema conversion (Tasks 2–3), `lib/db.ts` (4), `lib/db-types.ts` (5), auth system (6–12), no-browser-DB endpoints (13–17), all 8 DB-touching API routes converted (13, 18–25), all 6 dashboard pages (26–27), all client components (28), file deletions + env (29), verification incl. org isolation (30). The `health` route is not touched — it has no database usage.
- **Out of scope (pre-existing, unchanged):** Template *creation* has no backend endpoint in the current app (`RequestTemplateBuilder` does not call the database); this migration preserves that existing behavior. The Vercel cron calls `/api/reviews/sync`; the route remains a `POST` handler as today.
- **Type consistency:** `getSession()` → `{ userId, email }`; `getCurrentOrgId(userId)` → `string | null`; `newId()` → `string`; `db.ts` helpers `queryMany/queryOne/execute/count` used consistently. `RequestTemplate.active` is `boolean` in `db-types.ts` and converted from INTEGER in `app/dashboard/requests/page.tsx`.
