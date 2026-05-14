'use client'

import { useState } from 'react'
import { Check, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PRICING } from '@/lib/stripe/client'
import { cn } from '@/lib/utils'

interface PricingTableProps {
  onSelect?: (plan: 'starter' | 'pro' | 'agency', interval: 'monthly' | 'yearly') => void
  ctaLabel?: string
}

export function PricingTable({ onSelect, ctaLabel = 'Start free trial' }: PricingTableProps) {
  const [interval, setInterval] = useState<'monthly' | 'yearly'>('monthly')

  return (
    <div className="w-full">
      <div className="flex items-center justify-center mb-8">
        <div className="inline-flex items-center bg-gray-100 rounded-full p-1">
          <button
            onClick={() => setInterval('monthly')}
            className={cn(
              'px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
              interval === 'monthly' ? 'bg-white shadow text-gray-900' : 'text-gray-500'
            )}
          >
            Monthly
          </button>
          <button
            onClick={() => setInterval('yearly')}
            className={cn(
              'px-4 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5',
              interval === 'yearly' ? 'bg-white shadow text-gray-900' : 'text-gray-500'
            )}
          >
            Yearly
            <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-semibold">
              2 mo free
            </span>
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {PRICING.map((tier) => {
          const price = interval === 'monthly' ? tier.monthly : Math.round(tier.yearly / 12)
          return (
            <Card
              key={tier.plan}
              className={cn(
                'p-6 relative flex flex-col',
                tier.popular && 'border-emerald-500 border-2 shadow-lg'
              )}
            >
              {tier.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Most popular
                </div>
              )}
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-gray-900">{tier.name}</h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-gray-900">${price}</span>
                  <span className="text-sm text-gray-500">/mo</span>
                </div>
                {interval === 'yearly' && (
                  <p className="text-xs text-gray-500 mt-1">Billed ${tier.yearly} annually</p>
                )}
              </div>
              <ul className="space-y-2.5 mb-6 flex-1">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-gray-700">
                    <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => onSelect?.(tier.plan, interval)}
                className={cn(
                  'w-full',
                  tier.popular ? 'bg-emerald-600 hover:bg-emerald-700' : ''
                )}
                variant={tier.popular ? 'default' : 'outline'}
              >
                {ctaLabel}
              </Button>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
