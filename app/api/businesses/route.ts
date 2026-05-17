import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { CreateLocationSchema } from '@/lib/validators'
import { getTierLimits, type Plan } from '@/lib/utils'
import { getSession, getCurrentOrgId, newId } from '@/lib/auth'
import { queryOne, execute, count } from '@/lib/db'
import type { Location } from '@/lib/db-types'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = await getCurrentOrgId(session.userId)
    if (!orgId) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

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
        { status: 422 },
      )
    }

    const subscription = await queryOne<{ plan: string }>(
      'SELECT plan FROM subscriptions WHERE org_id = ?',
      [orgId],
    )
    const plan = (subscription?.plan ?? 'starter') as Plan
    const limits = getTierLimits(plan)

    const locationCount = await count(
      'SELECT COUNT(*) AS c FROM locations WHERE org_id = ?',
      [orgId],
    )

    if (locationCount >= limits.locations) {
      return NextResponse.json(
        {
          error: `Location limit reached for your ${plan} plan. Upgrade to add more locations.`,
          upgrade: true,
          current_count: locationCount,
          limit: limits.locations,
        },
        { status: 403 },
      )
    }

    const id = newId()
    await execute(
      `INSERT INTO locations (id, org_id, name, address, google_place_id, facebook_page_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        orgId,
        parsed.data.name,
        parsed.data.address ?? null,
        parsed.data.google_place_id ?? null,
        parsed.data.facebook_page_id ?? null,
      ],
    )

    const location = await queryOne<Location>('SELECT * FROM locations WHERE id = ? AND org_id = ?', [id, orgId])

    return NextResponse.json(location, { status: 201 })
  } catch (err) {
    console.error('Unexpected error in POST /api/businesses:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
