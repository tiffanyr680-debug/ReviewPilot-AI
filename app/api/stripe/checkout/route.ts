import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { stripe, PRICE_IDS } from '@/lib/stripe/client'

const CheckoutSchema = z.object({
  plan: z.enum(['starter', 'pro', 'agency']),
  interval: z.enum(['monthly', 'yearly']),
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // 1. Authenticate user and get org_id + email
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userEmail = session.user.email
    if (!userEmail) {
      return NextResponse.json({ error: 'User email is required' }, { status: 400 })
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

    const parsed = CheckoutSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 422 }
      )
    }

    const { plan, interval } = parsed.data

    // 3. Get price_id
    const priceId = PRICE_IDS[plan][interval]
    if (!priceId) {
      return NextResponse.json({ error: 'Invalid plan or interval' }, { status: 400 })
    }

    // 4. Look up or create Stripe customer
    const { data: existingSubscription } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('org_id', orgId)
      .single()

    let customerId: string

    if (existingSubscription?.stripe_customer_id) {
      customerId = existingSubscription.stripe_customer_id
    } else {
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: { org_id: orgId },
      })
      customerId = customer.id

      // Upsert subscriptions table with stripe_customer_id
      await supabase.from('subscriptions').upsert(
        {
          org_id: orgId,
          stripe_customer_id: customerId,
          plan: 'starter',
          status: 'incomplete',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'org_id' }
      )
    }

    // 5. Create Stripe checkout session
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?canceled=true`,
      metadata: { org_id: orgId },
    })

    // 6. Return checkout URL
    return NextResponse.json({ url: checkoutSession.url })
  } catch (err) {
    console.error('Unexpected error in POST /api/stripe/checkout:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
