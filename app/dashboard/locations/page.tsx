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
