import { NextResponse } from 'next/server'
import { getSession, getCurrentOrgId } from '@/lib/auth'
import { queryOne, execute } from '@/lib/db'

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
