import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSession, getCurrentOrgId } from '@/lib/auth'
import { queryOne, execute } from '@/lib/db'
import type { RequestTemplate } from '@/lib/db-types'

export async function PATCH(
  request: NextRequest,
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

    const template = await queryOne<{ id: string }>(
      'SELECT id FROM request_templates WHERE id = ? AND org_id = ?',
      [id, orgId],
    )
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
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

    const delayHours = Math.max(1, Math.min(168, Number(trigger_delay_hours) || 24))
    const isActive = active !== false ? 1 : 0

    await execute(
      `UPDATE request_templates SET
         name = ?,
         sms_body = ?,
         email_subject = ?,
         email_body = ?,
         trigger_delay_hours = ?,
         active = ?
       WHERE id = ? AND org_id = ?`,
      [
        name.trim(),
        typeof sms_body === 'string' && sms_body.trim() ? sms_body.trim() : null,
        typeof email_subject === 'string' && email_subject.trim() ? email_subject.trim() : null,
        typeof email_body === 'string' && email_body.trim() ? email_body.trim() : null,
        delayHours,
        isActive,
        id,
        orgId,
      ],
    )

    const row = await queryOne<Omit<RequestTemplate, 'active'> & { active: number }>(
      'SELECT * FROM request_templates WHERE id = ? AND org_id = ?',
      [id, orgId],
    )
    if (!row) {
      return NextResponse.json({ error: 'Template not found after update' }, { status: 500 })
    }

    return NextResponse.json({ ...row, active: Boolean(row.active) })
  } catch (err) {
    console.error('Unexpected error in PATCH /api/templates/[id]:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

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

    const template = await queryOne<{ id: string }>(
      'SELECT id FROM request_templates WHERE id = ? AND org_id = ?',
      [id, orgId],
    )
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    await execute('DELETE FROM request_templates WHERE id = ? AND org_id = ?', [id, orgId])

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error in DELETE /api/templates/[id]:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
