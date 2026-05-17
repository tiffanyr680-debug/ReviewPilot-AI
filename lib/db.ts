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
