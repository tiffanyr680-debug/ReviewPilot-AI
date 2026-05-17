import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SyncReviewsSchema } from '@/lib/validators'
import { syncGoogleReviews, syncFacebookReviews } from '@/lib/review-sync'
import { sendNegativeReviewAlert } from '@/lib/email'
import { getSession, getCurrentOrgId } from '@/lib/auth'
import { queryMany, queryOne } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`

    let orgId: string | null = null
    if (!isCron) {
      const session = await getSession()
      if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      orgId = await getCurrentOrgId(session.userId)
      if (!orgId) {
        return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
      }
    }

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
        { status: 422 },
      )
    }

    const { location_id } = parsed.data

    // Build the locations query — cron syncs all orgs, users only their own.
    let locationsSql =
      'SELECT id, org_id, google_place_id, facebook_page_id FROM locations'
    const locationsArgs: string[] = []
    const where: string[] = []
    if (!isCron) {
      where.push('org_id = ?')
      locationsArgs.push(orgId as string)
    }
    if (location_id) {
      where.push('id = ?')
      locationsArgs.push(location_id)
    }
    if (where.length > 0) locationsSql += ' WHERE ' + where.join(' AND ')

    const locations = await queryMany<{
      id: string
      org_id: string
      google_place_id: string | null
      facebook_page_id: string | null
    }>(locationsSql, locationsArgs)

    let totalSynced = 0
    for (const loc of locations) {
      if (loc.google_place_id) {
        totalSynced += await syncGoogleReviews(loc.id, loc.org_id, loc.google_place_id)
      }
      if (loc.facebook_page_id) {
        totalSynced += await syncFacebookReviews(loc.id, loc.org_id, loc.facebook_page_id)
      }
    }

    // Send alerts for negative reviews without replies.
    if (locations.length > 0) {
      const locationIds = locations.map((l) => l.id)
      const placeholders = locationIds.map(() => '?').join(', ')
      const negativeReviews = await queryMany<{
        id: string
        org_id: string
        author_name: string | null
        rating: number | null
        content: string | null
        source: string | null
      }>(
        `SELECT id, org_id, author_name, rating, content, source
           FROM reviews
          WHERE location_id IN (${placeholders})
            AND rating <= 2 AND sentiment = 'negative' AND reply_content IS NULL`,
        locationIds,
      )

      for (const review of negativeReviews) {
        const owner = await queryOne<{ name: string; email: string }>(
          `SELECT o.name AS name, u.email AS email
             FROM organizations o
             JOIN users u ON u.id = o.owner_id
            WHERE o.id = ?`,
          [review.org_id],
        )
        if (!owner?.email) continue

        try {
          await sendNegativeReviewAlert(
            owner.email,
            owner.name,
            review.author_name ?? 'Anonymous',
            review.rating ?? 0,
            review.content ?? '',
            review.source ?? 'unknown',
          )
        } catch (alertErr) {
          console.error('Failed to send negative review alert:', alertErr)
        }
      }
    }

    return NextResponse.json({ synced: totalSynced, locations: locations.length })
  } catch (err) {
    console.error('Unexpected error in POST /api/reviews/sync:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
