import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { stripe, PRICE_IDS } from '@/lib/stripe/client'
import { getSession, getCurrentOrgId, newId } from '@/lib/auth'
import { queryOne, execute } from '@/lib/db'

const CheckoutSchema = z.object({
  plan: z.enum(['starter', 'pro', 'agency']),
  interval: z.enum(['monthly', 'yearly']),
})

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

    const parsed = CheckoutSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 422 },
      )
    }

    const { plan, interval } = parsed.data
    const priceId = PRICE_IDS[plan][interval]
    if (!priceId) {
      return NextResponse.json({ error: 'Invalid plan or interval' }, { status: 400 })
    }

    const existingSubscription = await queryOne<{ stripe_customer_id: string | null }>(
      'SELECT stripe_customer_id FROM subscriptions WHERE org_id = ?',
      [orgId],
    )

    let customerId: string
    if (existingSubscription?.stripe_customer_id) {
      customerId = existingSubscription.stripe_customer_id
    } else {
      const customer = await stripe.customers.create({
        email: session.email,
        metadata: { org_id: orgId },
      })
      customerId = customer.id

      await execute(
        `INSERT INTO subscriptions (id, org_id, stripe_customer_id, plan, status, updated_at)
         VALUES (?, ?, ?, 'starter', 'incomplete', ?)
         ON CONFLICT(org_id) DO UPDATE SET
           stripe_customer_id = excluded.stripe_customer_id,
           updated_at = excluded.updated_at`,
        [newId(), orgId, customerId, new Date().toISOString()],
      )
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?canceled=true`,
      metadata: { org_id: orgId },
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (err) {
    console.error('Unexpected error in POST /api/stripe/checkout:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
