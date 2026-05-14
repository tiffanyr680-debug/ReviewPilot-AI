import { createClient } from '@/lib/supabase/server'
import { LocationsClient } from './LocationsClient'
import type { Location } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

export default async function LocationsPage() {
  const supabase = await createClient()
  const { data: orgId } = await supabase.rpc('get_user_org_id')
  if (!orgId) return <p className="text-sm text-gray-500">Loading…</p>

  const [{ data: locations }, { data: sub }] = await Promise.all([
    supabase
      .from('locations')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false }),
    supabase.from('subscriptions').select('plan').eq('org_id', orgId).maybeSingle(),
  ])

  return (
    <LocationsClient
      initialLocations={(locations ?? []) as Location[]}
      plan={(sub?.plan ?? 'starter') as 'starter' | 'pro' | 'agency'}
    />
  )
}
