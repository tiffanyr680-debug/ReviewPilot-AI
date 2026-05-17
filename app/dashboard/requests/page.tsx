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
