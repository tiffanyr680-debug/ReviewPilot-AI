import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { stripe, getPlanFromPriceId } from '@/lib/stripe/client'
import type Stripe from 'stripe'

export async function POST(request: NextRequest) {
  // 1. Read raw body
  const body = await request.text()

  // 2. Get stripe-signature header
  const sig = request.headers.get('stripe-signature')
  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  // 3. Construct and verify webhook event
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Stripe webhook signature verification failed:', message)
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 })
  }

  // 5. Use service client to bypass RLS for all DB operations
  const supabase = await createServiceClient()

  // 4. Handle events
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

        // Fetch the subscription from Stripe to get price + plan
        const sub = await stripe.subscriptions.retrieve(subscriptionId)
        const priceId = sub.items.data[0].price.id
        const plan = getPlanFromPriceId(priceId)

        // Upsert subscriptions table
        const { error } = await supabase.from('subscriptions').upsert(
          {
            org_id: orgId,
            stripe_subscription_id: subscriptionId,
            stripe_customer_id: session.customer as string,
            status: 'active',
            plan,
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'org_id' }
        )

        if (error) {
          console.error('Failed to upsert subscription on checkout.session.completed:', error)
        }
        break
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const priceId = sub.items.data[0].price.id
        const plan = getPlanFromPriceId(priceId)

        const { error } = await supabase
          .from('subscriptions')
          .update({
            status: sub.status,
            plan,
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', sub.id)

        if (error) {
          console.error('Failed to update subscription on customer.subscription.updated:', error)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription

        const { error } = await supabase
          .from('subscriptions')
          .update({
            status: 'inactive',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', sub.id)

        if (error) {
          console.error('Failed to update subscription on customer.subscription.deleted:', error)
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice

        const { error } = await supabase
          .from('subscriptions')
          .update({
            status: 'past_due',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', invoice.subscription as string)

        if (error) {
          console.error('Failed to update subscription on invoice.payment_failed:', error)
        }
        break
      }

      default:
        // Unhandled event type — not an error, just ignore
        console.log(`Unhandled Stripe event type: ${event.type}`)
    }
  } catch (handlerErr) {
    console.error(`Error handling Stripe event ${event.type}:`, handlerErr)
    // Return 200 so Stripe doesn't retry — the error is logged for investigation
    return NextResponse.json({ received: true, warning: 'Handler error logged' })
  }

  // 6. Return success
  return NextResponse.json({ received: true })
}
