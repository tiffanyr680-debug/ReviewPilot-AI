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
