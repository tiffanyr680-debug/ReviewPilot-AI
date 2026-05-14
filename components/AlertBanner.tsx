'use client'

import { AlertTriangle, X } from 'lucide-react'
import { useState } from 'react'
import type { Review } from '@/lib/supabase/types'

interface AlertBannerProps {
  negativeReviews: Review[]
}

export function AlertBanner({ negativeReviews }: AlertBannerProps) {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed || negativeReviews.length === 0) return null

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-sm font-medium text-red-800">
          {negativeReviews.length === 1
            ? '1 new negative review requires attention'
            : `${negativeReviews.length} new negative reviews require attention`}
        </p>
        <p className="text-xs text-red-600 mt-0.5">
          Go to the Review Inbox to respond with an AI-drafted reply.
        </p>
      </div>
      <button onClick={() => setDismissed(true)} className="text-red-400 hover:text-red-600">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
