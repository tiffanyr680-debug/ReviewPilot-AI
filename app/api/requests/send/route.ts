import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SendRequestSchema } from '@/lib/validators'
import { getTierLimits } from '@/lib/utils'
import type { Plan } from '@/lib/utils'
import { sendReviewRequestEmail } from '@/lib/email'
import { sendReviewRequestSMS } from '@/lib/sms'

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

    const parsed = SendRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 422 }
      )
    }

    const { customer_name, customer_phone, customer_email, template_id, location_id } = parsed.data

    // 3. Check subscription limits
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan, status')
      .eq('org_id', orgId)
      .single()

    const plan = (subscription?.plan ?? 'starter') as Plan
    const limits = getTierLimits(plan)

    // Count requests sent this calendar month
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const { count: monthlyCount, error: countError } = await supabase
      .from('review_requests')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('sent_at', startOfMonth.toISOString())

    if (countError) {
      return NextResponse.json({ error: 'Failed to check request count' }, { status: 500 })
    }

    if (plan !== 'agency' && (monthlyCount ?? 0) >= limits.requestsPerMonth) {
      return NextResponse.json(
        {
          error: 'Monthly request limit reached',
          upgrade: true,
          current_count: monthlyCount,
          limit: limits.requestsPerMonth,
        },
        { status: 403 }
      )
    }

    // 4. Fetch template (must belong to org)
    const { data: template, error: templateError } = await supabase
      .from('request_templates')
      .select('*')
      .eq('id', template_id)
      .eq('org_id', orgId)
      .single()

    if (templateError || !template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    // 5. Fetch location (must belong to org)
    const { data: location, error: locationError } = await supabase
      .from('locations')
      .select('*')
      .eq('id', location_id)
      .eq('org_id', orgId)
      .single()

    if (locationError || !location) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    // 6. Build review link
    const reviewLink = location.google_place_id
      ? `https://search.google.com/local/writereview?placeid=${location.google_place_id}`
      : `${process.env.NEXT_PUBLIC_APP_URL}/review/${location_id}`

    // 7. Send SMS if phone provided and plan allows SMS
    if (customer_phone && limits.sms) {
      try {
        await sendReviewRequestSMS(
          customer_phone,
          customer_name,
          location.name,
          reviewLink,
          template.sms_body ?? undefined
        )
      } catch (smsErr) {
        console.error('SMS send failed:', smsErr)
        // Continue — don't block on SMS failure
      }
    }

    // 8. Send email if email provided
    if (customer_email) {
      try {
        await sendReviewRequestEmail(
          customer_email,
          customer_name,
          location.name,
          reviewLink
        )
      } catch (emailErr) {
        console.error('Email send failed:', emailErr)
        // Continue — don't block on email failure
      }
    }

    // 9. Insert review_request record
    const { data: reviewRequest, error: insertError } = await supabase
      .from('review_requests')
      .insert({
        org_id: orgId,
        location_id,
        template_id,
        customer_name,
        customer_phone: customer_phone ?? null,
        customer_email: customer_email ?? null,
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('review_requests insert error:', insertError)
      return NextResponse.json({ error: 'Failed to record review request' }, { status: 500 })
    }

    // 10. Insert audit log entry
    await supabase.from('audit_logs').insert({
      org_id: orgId,
      user_id: session.user.id,
      action: 'review_request_sent',
      entity_type: 'review_request',
      entity_id: reviewRequest.id,
      metadata: { customer_name, location_id, template_id },
    })

    // 11. Return success
    return NextResponse.json({ success: true, request_id: reviewRequest.id })
  } catch (err) {
    console.error('Unexpected error in POST /api/requests/send:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
