import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SendRequestSchema } from '@/lib/validators'
import { getTierLimits, type Plan } from '@/lib/utils'
import { sendReviewRequestEmail } from '@/lib/email'
import { sendReviewRequestSMS } from '@/lib/sms'
import { getSession, getCurrentOrgId, newId } from '@/lib/auth'
import { queryOne, execute, count } from '@/lib/db'
import type { RequestTemplate, Location } from '@/lib/db-types'

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

    const parsed = SendRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 422 },
      )
    }

    const { customer_name, customer_phone, customer_email, template_id, location_id } =
      parsed.data

    const subscription = await queryOne<{ plan: string }>(
      'SELECT plan FROM subscriptions WHERE org_id = ?',
      [orgId],
    )
    const plan = (subscription?.plan ?? 'starter') as Plan
    const limits = getTierLimits(plan)

    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const monthlyCount = await count(
      'SELECT COUNT(*) AS c FROM review_requests WHERE org_id = ? AND sent_at >= ?',
      [orgId, startOfMonth.toISOString()],
    )

    if (plan !== 'agency' && monthlyCount >= limits.requestsPerMonth) {
      return NextResponse.json(
        {
          error: 'Monthly request limit reached',
          upgrade: true,
          current_count: monthlyCount,
          limit: limits.requestsPerMonth,
        },
        { status: 403 },
      )
    }

    const template = await queryOne<RequestTemplate>(
      'SELECT * FROM request_templates WHERE id = ? AND org_id = ?',
      [template_id, orgId],
    )
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    const location = await queryOne<Location>(
      'SELECT * FROM locations WHERE id = ? AND org_id = ?',
      [location_id, orgId],
    )
    if (!location) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    const reviewLink = location.google_place_id
      ? `https://search.google.com/local/writereview?placeid=${location.google_place_id}`
      : `${process.env.NEXT_PUBLIC_APP_URL}/review/${location_id}`

    if (customer_phone && limits.sms) {
      try {
        await sendReviewRequestSMS(
          customer_phone,
          customer_name,
          location.name,
          reviewLink,
          template.sms_body ?? undefined,
        )
      } catch (smsErr) {
        console.error('SMS send failed:', smsErr)
      }
    }

    if (customer_email) {
      try {
        await sendReviewRequestEmail(customer_email, customer_name, location.name, reviewLink)
      } catch (emailErr) {
        console.error('Email send failed:', emailErr)
      }
    }

    const requestId = newId()
    await execute(
      `INSERT INTO review_requests
         (id, org_id, location_id, template_id, customer_name, customer_phone, customer_email, status, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'sent', ?)`,
      [
        requestId,
        orgId,
        location_id,
        template_id,
        customer_name,
        customer_phone ?? null,
        customer_email ?? null,
        new Date().toISOString(),
      ],
    )

    await execute(
      `INSERT INTO audit_logs (id, org_id, user_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, ?, 'review_request_sent', 'review_request', ?, ?)`,
      [
        newId(),
        orgId,
        session.userId,
        requestId,
        JSON.stringify({ customer_name, location_id, template_id }),
      ],
    )

    return NextResponse.json({ success: true, request_id: requestId })
  } catch (err) {
    console.error('Unexpected error in POST /api/requests/send:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
