# ReviewPilot AI: Supabase → Turso Migration

**Date:** 2026-05-16
**Status:** Approved design — ready for implementation planning

## Summary

Migrate ReviewPilot AI's data layer from Supabase (Postgres) to Turso (libSQL/SQLite).
Turso provides only data storage, so two capabilities Supabase supplied — authentication
and row-level security — are rebuilt inside the application.

No user-facing behavior changes. Every screen, the magic-link sign-in experience, Stripe
billing, AI reply drafting, review syncing, and email/SMS all behave identically.

There is **no data to migrate**: the current `.env.local` holds placeholder Supabase
credentials, so no real database has ever been connected. This is a clean cutover.

## Goals

- Replace Supabase Postgres with a Turso database.
- Rebuild login as a custom magic-link system (same UX as today).
- Enforce per-organization data isolation in application code.
- Keep all features, routes, and screens functionally unchanged.

## Non-goals

- No changes to UI, styling, or screen layouts.
- No changes to external integrations' logic (Stripe, Resend, Twilio, Anthropic,
  Google/Facebook review APIs) — only their database calls convert.
- No new features. This is a plumbing migration.
- No ORM. Per decision below, a thin SQL layer is used instead of Drizzle.

## Key decisions

1. **Login: custom magic-link.** Chosen over Auth.js and email+password. Keeps the
   existing experience (enter email → click one-time link), reuses Resend (already a
   project dependency), and adds the least machinery.
2. **Data layer: thin SQL layer.** Chosen over Drizzle ORM. A single `lib/db.ts` holds
   the Turso connection plus small query helpers; routes write parameterized SQL. Fewer
   dependencies, lower-risk mechanical migration, less long-term maintenance.

## Current architecture (what exists today)

- Next.js 15 App Router, React 19, TypeScript, deployed to Vercel.
- Supabase Postgres: 8 tables — `organizations`, `organization_members`, `locations`,
  `reviews`, `review_requests`, `request_templates`, `subscriptions`, `audit_logs`.
- Supabase Auth: magic-link OTP (`signInWithOtp` / `exchangeCodeForSession`).
- Row-level security on all tables, scoped by a `get_user_org_id()` SQL function.
- ~57 `.from()` query call sites across 19 files (API routes, server components,
  and 3 client components).
- `lib/supabase/{client,server,types}.ts` provide browser/server clients and DB types.
- `createServiceClient()` provides a service-role client that bypasses RLS (used by
  the dashboard layout's org-bootstrap and the Stripe webhook + cron sync).

## Target architecture

### 1. Database (Turso / SQLite)

A new `db/schema.sql` recreates all 8 tables in SQLite form:

| Postgres | SQLite |
|---|---|
| `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | `TEXT PRIMARY KEY` — app generates UUIDs via `crypto.randomUUID()` |
| `TIMESTAMPTZ DEFAULT NOW()` | `TEXT NOT NULL DEFAULT (datetime('now'))` — ISO date strings |
| `DECIMAL(3,2)` | `REAL` |
| `INT` | `INTEGER` |
| `BOOLEAN DEFAULT TRUE` | `INTEGER DEFAULT 1` (0/1) — only `request_templates.active` |
| `JSONB` | `TEXT` — JSON string; only `audit_logs.metadata` |
| `CHECK (... IN (...))`, `CHECK (rating BETWEEN 1 AND 5)` | kept as-is (SQLite supports CHECK) |
| `REFERENCES ... ON DELETE CASCADE` | kept; requires `PRAGMA foreign_keys = ON` per connection |
| `owner_id REFERENCES auth.users(id)` | references new `users` table |
| all indexes | kept as-is |

Dropped entirely: `CREATE EXTENSION pgcrypto`, all `ENABLE ROW LEVEL SECURITY`, all
`CREATE POLICY`, and the `get_user_org_id()` function.

The schema is loaded into the Turso database by a small one-off Node script using
`@libsql/client`. **No Turso CLI installation is required** (avoids Windows CLI setup).

Foreign-key cascade enforcement requires `PRAGMA foreign_keys = ON` on each connection;
the `lib/db.ts` connection helper sets this.

### 2. Authentication (custom magic-link)

Three new tables:

- `users` — `id` (TEXT PK), `email` (TEXT UNIQUE NOT NULL), `created_at`.
- `auth_tokens` — single-use magic-link tokens: `id` (TEXT PK), `token_hash`
  (TEXT — SHA-256 of the token), `email`, `expires_at`, `used_at`, `created_at`.
- `sessions` — `id` (TEXT PK = session token), `user_id`, `expires_at`, `created_at`.

A new `lib/auth.ts` provides:
- `getSession()` — reads the session cookie, looks up `sessions` joined to `users`,
  returns `{ userId, email }` or `null`.
- `getCurrentOrgId(userId)` — replaces the `get_user_org_id()` RPC; queries
  `organization_members` by `user_id`.
- helpers to create tokens, verify tokens, create/destroy sessions.

Flow:
1. **Sign in** — `POST /api/auth/signin` (new): upsert `users` row for the email,
   create an `auth_tokens` row (random 256-bit token, store SHA-256 hash, 15-minute
   expiry), email the link `${APP_URL}/api/auth/callback?token=...` via Resend.
2. **Callback** — `GET /api/auth/callback?token=...` (rewritten): hash the token, find
   a matching unused, unexpired `auth_tokens` row, mark it used, create a `sessions`
   row (30-day expiry), set an HTTP-only / Secure / SameSite=Lax `session` cookie,
   redirect to `/dashboard`.
3. **Session checks** — server components and API routes call `getSession()` instead
   of `supabase.auth.getSession()` / `getUser()`.
4. **Sign out** — `POST /api/auth/signout` (new): delete the session row, clear cookie.

The session token is a random secret stored server-side, so sessions are revocable;
no JWT or cookie-signing secret is needed.

The dashboard layout's `ensureOrgForUser` bootstrap logic (create org + owner
membership + trialing subscription on first login) is preserved, rewritten against
Turso.

### 3. Security model

Losing row-level security has two consequences:

- **No database access from the browser.** The Turso auth token grants full database
  access and must never reach the client. `lib/supabase/client.ts` is deleted. The 3
  client components that currently query the database directly move their writes to
  server endpoints:
  - `LocationsClient.tsx` — `locations` delete → new `DELETE /api/businesses/[id]`.
  - `SettingsClient.tsx` — `organizations` profile update → new `PATCH /api/org`.
  - `RequestsClient.tsx` — `request_templates` delete → new `DELETE /api/templates/[id]`.
  Browser behavior is unchanged; each becomes a `fetch` to the new endpoint.
- **Application-level org scoping.** RLS previously enforced isolation automatically.
  Now every server query must explicitly filter by the caller's `org_id`. This becomes
  the single most important security discipline of the migration: every query that
  touches org-scoped data includes `WHERE org_id = ?`, reviewed individually.

The `createServiceClient()` / service-role distinction disappears — Turso has one
access level. Cron and webhook routes use the same DB connection; the cron route keeps
its existing `CRON_SECRET` bearer-token check, and the Stripe webhook keeps its
signature verification.

### 4. Data access layer

- `lib/db.ts` — singleton libSQL client created from `TURSO_DATABASE_URL` and
  `TURSO_AUTH_TOKEN`, with `PRAGMA foreign_keys = ON`. Small helpers: `queryOne`,
  `queryMany`, `execute`. All queries use parameterized SQL (`?` placeholders) — no
  string interpolation, no injection risk.
- `lib/db-types.ts` — plain TypeScript row interfaces ported from the current
  `lib/supabase/types.ts`, so TypeScript still knows every column.
- Type conversions handled explicitly at the few call sites that need them:
  `request_templates.active` (INTEGER 0/1 ↔ boolean) and `audit_logs.metadata`
  (TEXT ↔ JSON via `JSON.parse`/`JSON.stringify`).

### 5. Environment variables

Remove: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`.

Add: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`.

Required and currently missing from `.env.local`: `RESEND_API_KEY`,
`RESEND_FROM_EMAIL` — login emails go through Resend, so these must be set for sign-in
to work. `NEXT_PUBLIC_APP_URL` is already present.

`.env.example` is updated to match.

## File change map (~25 files)

**New files**
- `lib/db.ts`, `lib/db-types.ts`, `lib/auth.ts`
- `db/schema.sql`, plus a one-off schema-load script
- `app/api/auth/signin/route.ts`, `app/api/auth/signout/route.ts`
- `app/api/businesses/[id]/route.ts` (DELETE), `app/api/org/route.ts` (PATCH),
  `app/api/templates/[id]/route.ts` (DELETE)

**Rewritten** (Supabase calls → Turso SQL)
- `app/api/auth/callback/route.ts`
- `app/dashboard/layout.tsx`
- 8 API routes with database calls: `ai/draft-response`, `alerts`, `businesses`,
  `requests/send`, `reviews/sync`, `stripe/checkout`, `stripe/portal`,
  `webhooks/stripe`
- 6 dashboard pages: `dashboard/page.tsx`, `analytics`, `inbox`, `locations`,
  `requests`, `settings`
- `lib/review-sync.ts`
- `app/api/health/route.ts` — only if it imports the Supabase client; updated to a
  Turso connectivity check if so, otherwise left unchanged.

**Modified** (swap direct DB calls for `fetch`)
- `app/auth/signin/page.tsx`, `SettingsClient.tsx`, `LocationsClient.tsx`,
  `RequestsClient.tsx`

**Deleted**
- `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/types.ts`
- `supabase/migrations/001_schema.sql` (replaced by `db/schema.sql`)

**Dependencies** (`package.json`)
- Remove: `@supabase/supabase-js`, `@supabase/ssr`
- Add: `@libsql/client`

## Manual setup the user performs

1. In the Turso dashboard, **Create Database**; obtain its URL and an auth token.
2. Obtain a **Resend** API key and a verified sender email.
3. (Assistant wires these into `.env.local` and loads the schema.)

## Risks and mitigations

- **Org isolation now enforced by app code, not the database.** Mitigation: one
  centralized query pattern, every org-scoped query reviewed, end-to-end testing that a
  user sees only their own organization's data.
- **New security-sensitive auth code.** Mitigation: keep it minimal and standard —
  hashed single-use tokens, short expiry, HTTP-only cookies, server-stored revocable
  sessions.
- **SQLite/Postgres semantic differences** (booleans, JSON, timestamps). Mitigation:
  explicit conversions at the few affected call sites, listed above.

## Testing / verification

- `npm run type-check`, `npm run build`, `npm run lint` all pass.
- Login end-to-end: request link → receive email → click → land on dashboard → sign out.
- Each dashboard screen loads and its create/update/delete actions work.
- Org isolation: a second account cannot see the first account's data.
