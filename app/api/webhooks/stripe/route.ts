import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type Stripe from 'stripe'
import { stripe, getPlanFromPriceId } from '@/lib/stripe/client'
import { execute } from '@/lib/db'
import { newId } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')
  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Stripe webhook signature verification failed:', message)
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const orgId = session.metadata?.org_id
        const subscriptionId = session.subscription as string

        if (!orgId || !subscriptionId) {
          console.error('checkout.session.completed: missing org_id or subscription_id', session.id)
          break
        }

        const sub = await stripe.subscriptions.retrieve(subscriptionId)
        const plan = getPlanFromPriceId(sub.items.data[0].price.id)

        await execute(
          `INSERT INTO subscriptions
             (id, org_id, stripe_subscription_id, stripe_customer_id, status, plan, current_period_end, updated_at)
           VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
           ON CONFLICT(org_id) DO UPDATE SET
             stripe_subscription_id = excluded.stripe_subscription_id,
             stripe_customer_id     = excluded.stripe_customer_id,
             status                 = excluded.status,
             plan                   = excluded.plan,
             current_period_end     = excluded.current_period_end,
             updated_at             = excluded.updated_at`,
          [
            newId(),
            orgId,
            subscriptionId,
            session.customer as string,
            plan,
            new Date(sub.current_period_end * 1000).toISOString(),
            new Date().toISOString(),
          ],
        )
        break
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const plan = getPlanFromPriceId(sub.items.data[0].price.id)

        await execute(
          `UPDATE subscriptions
              SET status = ?, plan = ?, current_period_end = ?, updated_at = ?
            WHERE stripe_subscription_id = ?`,
          [
            sub.status,
            plan,
            new Date(sub.current_period_end * 1000).toISOString(),
            new Date().toISOString(),
            sub.id,
          ],
        )
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        await execute(
          'UPDATE subscriptions SET status = ?, updated_at = ? WHERE stripe_subscription_id = ?',
          ['inactive', new Date().toISOString(), sub.id],
        )
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        await execute(
          'UPDATE subscriptions SET status = ?, updated_at = ? WHERE stripe_subscription_id = ?',
          ['past_due', new Date().toISOString(), invoice.subscription as string],
        )
        break
      }

      default:
        console.log(`Unhandled Stripe event type: ${event.type}`)
    }
  } catch (handlerErr) {
    console.error(`Error handling Stripe event ${event.type}:`, handlerErr)
    return NextResponse.json({ received: true, warning: 'Handler error logged' })
  }

  return NextResponse.json({ received: true })
}
