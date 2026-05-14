import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/client'

export async function GET() {
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

    // 2. Fetch stripe_customer_id from subscriptions table
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('org_id', orgId)
      .single()

    if (subError || !subscription?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No billing account found. Please subscribe to a plan first.' },
        { status: 404 }
      )
    }

    // 3. Create billing portal session
    const portal = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings`,
    })

    // 4. Redirect to portal URL
    return NextResponse.redirect(portal.url)
  } catch (err) {
    console.error('Unexpected error in GET /api/stripe/portal:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
