import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { CreateLocationSchema } from '@/lib/validators'
import { getTierLimits } from '@/lib/utils'
import type { Plan } from '@/lib/utils'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // 1. Authenticate user
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Get org_id via RPC
    const { data: orgId, error: orgError } = await supabase.rpc('get_user_org_id')
    if (orgError || !orgId) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // 3. Validate request body
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = CreateLocationSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 422 }
      )
    }

    // 4. Check subscription plan and enforce location count limit
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan, status')
      .eq('org_id', orgId)
      .single()

    const plan = (subscription?.plan ?? 'starter') as Plan
    const limits = getTierLimits(plan)

    const { count: locationCount, error: countError } = await supabase
      .from('locations')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)

    if (countError) {
      return NextResponse.json({ error: 'Failed to check location count' }, { status: 500 })
    }

    if ((locationCount ?? 0) >= limits.locations) {
      return NextResponse.json(
        {
          error: `Location limit reached for your ${plan} plan. Upgrade to add more locations.`,
          upgrade: true,
          current_count: locationCount,
          limit: limits.locations,
        },
        { status: 403 }
      )
    }

    // 5. Insert the new location
    const { data: location, error: insertError } = await supabase
      .from('locations')
      .insert({
        org_id: orgId,
        name: parsed.data.name,
        address: parsed.data.address ?? null,
        google_place_id: parsed.data.google_place_id ?? null,
        facebook_page_id: parsed.data.facebook_page_id ?? null,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Location insert error:', insertError)
      return NextResponse.json({ error: 'Failed to create location' }, { status: 500 })
    }

    // 6. Return created location with 201 status
    return NextResponse.json(location, { status: 201 })
  } catch (err) {
    console.error('Unexpected error in POST /api/businesses:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
