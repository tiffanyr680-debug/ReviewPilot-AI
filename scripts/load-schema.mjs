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
