import { createClient } from '@/lib/supabase/server'
import { InboxClient } from './InboxClient'
import type { Review } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

export default async function InboxPage() {
  const supabase = await createClient()
  const { data: orgId } = await supabase.rpc('get_user_org_id')
  if (!orgId) return <p className="text-sm text-gray-500">Loading…</p>

  const [{ data: reviews }, { data: org }, { data: locations }] = await Promise.all([
    supabase
      .from('reviews')
      .select('*')
      .eq('org_id', orgId)
      .order('posted_at', { ascending: false, nullsFirst: false })
      .limit(200),
    supabase.from('organizations').select('brand_voice').eq('id', orgId).maybeSingle(),
    supabase.from('locations').select('id, name').eq('org_id', orgId),
  ])

  return (
    <InboxClient
      initialReviews={(reviews ?? []) as Review[]}
      brandVoice={org?.brand_voice ?? 'Friendly and professional.'}
      locations={locations ?? []}
    />
  )
}
