import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()

    // 1. Authenticate user and get org_id
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: orgId, error: orgError } = await supabase.rpc('get_user_org_id')
    if (orgError || !orgId) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // 2. Query negative reviews without replies
    const { data: alerts, error: alertsError } = await supabase
      .from('reviews')
      .select('*')
      .eq('org_id', orgId)
      .eq('sentiment', 'negative')
      .is('reply_content', null)
      .order('synced_at', { ascending: false })
      .limit(50)

    if (alertsError) {
      console.error('Failed to fetch alerts:', alertsError)
      return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 })
    }

    // 3. Return alerts with count
    return NextResponse.json({
      alerts: alerts ?? [],
      count: (alerts ?? []).length,
    })
  } catch (err) {
    console.error('Unexpected error in GET /api/alerts:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
