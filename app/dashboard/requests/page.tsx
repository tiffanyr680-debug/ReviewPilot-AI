import { createClient } from '@/lib/supabase/server'
import { RequestsClient } from './RequestsClient'
import type { RequestTemplate, ReviewRequest, Location } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

export default async function RequestsPage() {
  const supabase = await createClient()
  const { data: orgId } = await supabase.rpc('get_user_org_id')
  if (!orgId) return <p className="text-sm text-gray-500">Loading…</p>

  const [{ data: templates }, { data: recent }, { data: locations }, { data: sub }] =
    await Promise.all([
      supabase
        .from('request_templates')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false }),
      supabase
        .from('review_requests')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase.from('locations').select('id, name').eq('org_id', orgId),
      supabase.from('subscriptions').select('plan').eq('org_id', orgId).maybeSingle(),
    ])

  return (
    <RequestsClient
      initialTemplates={(templates ?? []) as RequestTemplate[]}
      recentRequests={(recent ?? []) as ReviewRequest[]}
      locations={(locations ?? []) as Pick<Location, 'id' | 'name'>[]}
      plan={(sub?.plan ?? 'starter') as 'starter' | 'pro' | 'agency'}
    />
  )
}
