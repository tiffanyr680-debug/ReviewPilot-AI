import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { DraftResponseSchema } from '@/lib/validators'
import { draftReviewResponse } from '@/lib/ai/provider'
import { getSession, getCurrentOrgId, newId } from '@/lib/auth'
import { queryOne, execute, count } from '@/lib/db'

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

    const parsed = DraftResponseSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 422 },
      )
    }

    const { review_id, review_text, rating, source } = parsed.data

    // Rate limit: max 20 AI draft requests per hour per org.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const recentDrafts = await count(
      `SELECT COUNT(*) AS c FROM audit_logs
        WHERE org_id = ? AND action = 'ai_draft_generated' AND created_at >= ?`,
      [orgId, oneHourAgo],
    )
    if (recentDrafts >= 20) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Max 20 AI drafts per hour.' },
        { status: 429 },
      )
    }

    const org = await queryOne<{ brand_voice: string | null }>(
      'SELECT brand_voice FROM organizations WHERE id = ?',
      [orgId],
    )
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }
    const brandVoice =
      org.brand_voice ?? 'Professional, friendly, and appreciative of customer feedback.'

    const review = await queryOne<{ id: string }>(
      'SELECT id FROM reviews WHERE id = ? AND org_id = ?',
      [review_id, orgId],
    )
    if (!review) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 })
    }

    let drafts: Awaited<ReturnType<typeof draftReviewResponse>>
    try {
      drafts = await draftReviewResponse(review_text, rating, source, brandVoice)
    } catch (aiErr) {
      console.error('AI draft generation error:', aiErr)
      if (aiErr instanceof SyntaxError) {
        return NextResponse.json(
          { error: 'AI returned an unparseable response. Please try again.' },
          { status: 500 },
        )
      }
      return NextResponse.json(
        { error: 'Failed to generate AI drafts. Please try again.' },
        { status: 500 },
      )
    }

    await execute(
      `INSERT INTO audit_logs (id, org_id, user_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, ?, 'ai_draft_generated', 'review', ?, ?)`,
      [newId(), orgId, session.userId, review_id, JSON.stringify({ rating, source })],
    )

    return NextResponse.json({ drafts })
  } catch (err) {
    console.error('Unexpected error in POST /api/ai/draft-response:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
