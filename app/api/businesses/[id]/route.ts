import { NextResponse } from 'next/server'
import { getSession, getCurrentOrgId } from '@/lib/auth'
import { db, queryOne } from '@/lib/db'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = await getCurrentOrgId(session.userId)
    if (!orgId) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const location = await queryOne<{ id: string }>(
      'SELECT id FROM locations WHERE id = ? AND org_id = ?',
      [id, orgId],
    )
    if (!location) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    await db().batch(
      [
        { sql: 'DELETE FROM reviews WHERE location_id = ? AND org_id = ?', args: [id, orgId] },
        { sql: 'DELETE FROM review_requests WHERE location_id = ? AND org_id = ?', args: [id, orgId] },
        { sql: 'DELETE FROM locations WHERE id = ? AND org_id = ?', args: [id, orgId] },
      ],
      'write',
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error in DELETE /api/businesses/[id]:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
