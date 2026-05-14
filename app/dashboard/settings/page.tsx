import { createClient } from '@/lib/supabase/server'
import { SettingsClient } from './SettingsClient'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: orgId } = await supabase.rpc('get_user_org_id')

  if (!user || !orgId) return <p className="text-sm text-gray-500">Loading…</p>

  const [{ data: org }, { data: sub }, { data: members }] = await Promise.all([
    supabase.from('organizations').select('*').eq('id', orgId).maybeSingle(),
    supabase.from('subscriptions').select('*').eq('org_id', orgId).maybeSingle(),
    supabase.from('organization_members').select('id, user_id, role').eq('org_id', orgId),
  ])

  return (
    <SettingsClient
      email={user.email ?? ''}
      orgName={org?.name ?? ''}
      brandVoice={org?.brand_voice ?? ''}
      plan={(sub?.plan ?? 'starter') as 'starter' | 'pro' | 'agency'}
      status={sub?.status ?? 'trialing'}
      memberCount={members?.length ?? 1}
      currentPeriodEnd={sub?.current_period_end ?? null}
    />
  )
}
