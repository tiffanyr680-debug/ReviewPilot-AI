import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSession, getCurrentOrgId, newId } from '@/lib/auth'
import { queryOne, execute } from '@/lib/db'
import type { RequestTemplate } from '@/lib/db-types'

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

    const {
      name,
      sms_body,
      email_subject,
      email_body,
      trigger_delay_hours,
      active,
    } = body as Record<string, unknown>

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 422 })
    }

    const id = newId()
    const delayHours = Math.max(1, Math.min(168, Number(trigger_delay_hours) || 24))
    const isActive = active !== false ? 1 : 0

    await execute(
      `INSERT INTO request_templates
         (id, org_id, name, sms_body, email_subject, email_body, trigger_delay_hours, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        orgId,
        name.trim(),
        typeof sms_body === 'string' && sms_body.trim() ? sms_body.trim() : null,
        typeof email_subject === 'string' && email_subject.trim() ? email_subject.trim() : null,
        typeof email_body === 'string' && email_body.trim() ? email_body.trim() : null,
        delayHours,
        isActive,
      ],
    )

    const row = await queryOne<Omit<RequestTemplate, 'active'> & { active: number }>(
      'SELECT * FROM request_templates WHERE id = ? AND org_id = ?',
      [id, orgId],
    )
    if (!row) {
      return NextResponse.json({ error: 'Failed to retrieve created template' }, { status: 500 })
    }

    return NextResponse.json({ ...row, active: Boolean(row.active) }, { status: 201 })
  } catch (err) {
    console.error('Unexpected error in POST /api/templates:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
