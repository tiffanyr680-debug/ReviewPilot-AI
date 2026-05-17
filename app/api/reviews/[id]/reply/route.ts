import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession, getCurrentOrgId } from '@/lib/auth'
import { queryOne, execute } from '@/lib/db'

const ReplySchema = z.object({
  reply_content: z.string().min(1).max(2000),
})

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

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = ReplySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 422 },
      )
    }

    const review = await queryOne<{ id: string }>(
      'SELECT id FROM reviews WHERE id = ? AND org_id = ?',
      [id, orgId],
    )
    if (!review) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 })
    }

    await execute('UPDATE reviews SET reply_content = ? WHERE id = ? AND org_id = ?', [
      parsed.data.reply_content,
      id,
      orgId,
    ])

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error in PATCH /api/reviews/[id]/reply:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
