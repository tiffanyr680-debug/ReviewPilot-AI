import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SyncReviewsSchema } from '@/lib/validators'
import { syncGoogleReviews, syncFacebookReviews } from '@/lib/review-sync'
import { sendNegativeReviewAlert } from '@/lib/email'

export async function POST(request: NextRequest) {
  try {
    // 1. Determine if cron or authenticated user
    const authHeader = request.headers.get('authorization')
    const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`

    let orgId: string | null = null
    let supabase: Awaited<ReturnType<typeof createClient>>

    if (isCron) {
      supabase = await createServiceClient()
    } else {
      supabase = await createClient()
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const { data: userOrgId, error: orgError } = await supabase.rpc('get_user_org_id')
      if (orgError || !userOrgId) {
        return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
      }
      orgId = userOrgId as string
    }

    // 2. Validate body
    let body: unknown
    try {
      body = await request.json()
    } catch {
      body = {}
    }

    const parsed = SyncReviewsSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 422 }
      )
    }

    const { location_id } = parsed.data

    // 3 & 4. Build locations query
    let locationsQuery = supabase
      .from('locations')
      .select('id, org_id, google_place_id, facebook_page_id')

    if (isCron) {
      // Sync ALL locations across all orgs
      if (location_id) {
        locationsQuery = locationsQuery.eq('id', location_id)
      }
    } else {
      // User mode: only their org's locations
      locationsQuery = locationsQuery.eq('org_id', orgId!)
      if (location_id) {
        locationsQuery = locationsQuery.eq('id', location_id)
      }
    }

    const { data: locations, error: locationsError } = await locationsQuery
    if (locationsError) {
      return NextResponse.json({ error: 'Failed to fetch locations' }, { status: 500 })
    }

    let totalSynced = 0

    // 5. Sync each location
    for (const loc of (locations ?? []) as Array<{ id: string; org_id: string; google_place_id: string | null; facebook_page_id: string | null }>) {
      if (loc.google_place_id) {
        const count = await syncGoogleReviews(supabase, loc.id, loc.org_id, loc.google_place_id)
        totalSynced += count
      }
      if (loc.facebook_page_id) {
        const count = await syncFacebookReviews(supabase, loc.id, loc.org_id, loc.facebook_page_id)
        totalSynced += count
      }
    }

    // 7 & 8. Check for new negative reviews without replies and send alerts
    if ((locations ?? []).length > 0) {
      const locationIds = ((locations ?? []) as Array<{ id: string }>).map(l => l.id)

      const { data: negativeReviews } = await supabase
        .from('reviews')
        .select('id, org_id, location_id, author_name, rating, content, source')
        .in('location_id', locationIds)
        .lte('rating', 2)
        .eq('sentiment', 'negative')
        .is('reply_content', null)

      // Service-role client required to read auth.users for owner email
      const adminClient = isCron ? supabase : await createServiceClient()
      for (const review of negativeReviews ?? []) {
        const { data: orgData } = await adminClient
          .from('organizations')
          .select('name, owner_id')
          .eq('id', review.org_id)
          .single()

        if (!orgData?.owner_id) continue

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: userResult } = await (adminClient.auth as any).admin.getUserById(orgData.owner_id)
        const ownerEmail = userResult?.user?.email
        if (!ownerEmail) continue

        try {
          await sendNegativeReviewAlert(
            ownerEmail,
            orgData.name,
            review.author_name ?? 'Anonymous',
            review.rating ?? 0,
            review.content ?? '',
            review.source ?? 'unknown'
          )
        } catch (alertErr) {
          console.error('Failed to send negative review alert:', alertErr)
        }
      }
    }

    // 9. Return results
    return NextResponse.json({
      synced: totalSynced,
      locations: (locations ?? []).length,
    })
  } catch (err) {
    console.error('Unexpected error in POST /api/reviews/sync:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
