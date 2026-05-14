import Stripe from 'stripe'
import type { Plan } from '@/lib/utils'

let _stripe: Stripe | null = null

function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('STRIPE_SECRET_KEY is not configured')
    _stripe = new Stripe(key, { apiVersion: '2023-10-16' })
  }
  return _stripe
}

export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (getStripe() as any)[prop]
  },
})

export const PRICE_IDS: Record<Plan, { monthly: string; yearly: string }> = {
  starter: {
    monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY ?? '',
    yearly: process.env.STRIPE_PRICE_STARTER_YEARLY ?? '',
  },
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY ?? '',
    yearly: process.env.STRIPE_PRICE_PRO_YEARLY ?? '',
  },
  agency: {
    monthly: process.env.STRIPE_PRICE_AGENCY_MONTHLY ?? '',
    yearly: process.env.STRIPE_PRICE_AGENCY_YEARLY ?? '',
  },
}

export function getPlanFromPriceId(priceId: string): Plan {
  for (const [plan, prices] of Object.entries(PRICE_IDS)) {
    if (prices.monthly === priceId || prices.yearly === priceId) {
      return plan as Plan
    }
  }
  return 'starter'
}

export const PRICING = [
  {
    plan: 'starter' as Plan,
    name: 'Starter',
    monthly: 29,
    yearly: 290,
    locations: 1,
    requests: '100/mo',
    features: ['1 location', '100 requests/mo', 'AI reply drafts', 'Email alerts', 'Unified inbox'],
  },
  {
    plan: 'pro' as Plan,
    name: 'Pro',
    monthly: 59,
    yearly: 590,
    locations: 3,
    requests: '500/mo',
    features: ['3 locations', '500 requests/mo', 'SMS + email', 'Sentiment analytics', 'AI reply drafts'],
    popular: true,
  },
  {
    plan: 'agency' as Plan,
    name: 'Agency',
    monthly: 149,
    yearly: 1490,
    locations: 10,
    requests: 'Unlimited',
    features: ['10 locations', 'Unlimited requests', 'White-label reports', '10 team seats', 'Priority support'],
  },
]
