import { NextResponse } from 'next/server'
import { getSession, getCurrentOrgId } from '@/lib/auth'
import { queryMany } from '@/lib/db'
import type { Review } from '@/lib/db-types'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = await getCurrentOrgId(session.userId)
    if (!orgId) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const alerts = await queryMany<Review>(
      `SELECT * FROM reviews
        WHERE org_id = ? AND sentiment = 'negative' AND reply_content IS NULL
        ORDER BY synced_at DESC
        LIMIT 50`,
      [orgId],
    )

    return NextResponse.json({ alerts, count: alerts.length })
  } catch (err) {
    console.error('Unexpected error in GET /api/alerts:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
