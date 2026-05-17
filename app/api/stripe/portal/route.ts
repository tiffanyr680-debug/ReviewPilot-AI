import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/client'
import { getSession, getCurrentOrgId } from '@/lib/auth'
import { queryOne } from '@/lib/db'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = await getCurrentOrgId(session.userId)
    if (!orgId) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const subscription = await queryOne<{ stripe_customer_id: string | null }>(
      'SELECT stripe_customer_id FROM subscriptions WHERE org_id = ?',
      [orgId],
    )

    if (!subscription?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No billing account found. Please subscribe to a plan first.' },
        { status: 404 },
      )
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings`,
    })

    return NextResponse.redirect(portal.url)
  } catch (err) {
    console.error('Unexpected error in GET /api/stripe/portal:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
