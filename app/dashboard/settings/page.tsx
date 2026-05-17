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
