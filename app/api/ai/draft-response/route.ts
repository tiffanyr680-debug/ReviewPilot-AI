import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { DraftResponseSchema } from '@/lib/validators'
import { draftReviewResponse } from '@/lib/ai/provider'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // 1. Authenticate user and get org_id
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: orgId, error: orgError } = await supabase.rpc('get_user_org_id')
    if (orgError || !orgId) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // 2. Validate body
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
        { status: 422 }
      )
    }

    const { review_id, review_text, rating, source } = parsed.data

    // 3. Rate limit: max 20 AI draft requests per hour per org
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    const { count: recentDrafts, error: rateError } = await supabase
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('action', 'ai_draft_generated')
      .gte('created_at', oneHourAgo)

    if (rateError) {
      return NextResponse.json({ error: 'Failed to check rate limit' }, { status: 500 })
    }

    if ((recentDrafts ?? 0) >= 20) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Max 20 AI drafts per hour.' },
        { status: 429 }
      )
    }

    // 4. Fetch org to get brand_voice
    const { data: org, error: orgFetchError } = await supabase
      .from('organizations')
      .select('brand_voice')
      .eq('id', orgId)
      .single()

    if (orgFetchError || !org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const brandVoice = org.brand_voice ?? 'Professional, friendly, and appreciative of customer feedback.'

    // 5. Verify review belongs to org
    const { data: review, error: reviewError } = await supabase
      .from('reviews')
      .select('id')
      .eq('id', review_id)
      .eq('org_id', orgId)
      .single()

    if (reviewError || !review) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 })
    }

    // 6. Call AI to generate drafts
    let drafts: Awaited<ReturnType<typeof draftReviewResponse>>
    try {
      drafts = await draftReviewResponse(review_text, rating, source, brandVoice)
    } catch (aiErr) {
      console.error('AI draft generation error:', aiErr)
      // 9. Handle JSON parse errors from AI gracefully
      if (aiErr instanceof SyntaxError) {
        return NextResponse.json(
          { error: 'AI returned an unparseable response. Please try again.' },
          { status: 500 }
        )
      }
      return NextResponse.json(
        { error: 'Failed to generate AI drafts. Please try again.' },
        { status: 500 }
      )
    }

    // 7. Log to audit_logs
    await supabase.from('audit_logs').insert({
      org_id: orgId,
      user_id: session.user.id,
      action: 'ai_draft_generated',
      entity_type: 'review',
      entity_id: review_id,
      metadata: { rating, source },
    })

    // 8. Return drafts
    return NextResponse.json({ drafts })
  } catch (err) {
    console.error('Unexpected error in POST /api/ai/draft-response:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
