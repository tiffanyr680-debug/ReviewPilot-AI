'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AIReplyButton } from '@/components/AIReplyButton'
import { Star, ExternalLink } from 'lucide-react'
import type { Review } from '@/lib/db-types'
import { formatRelativeTime, cn } from '@/lib/utils'

interface ReviewCardProps {
  review: Review
  brandVoice: string
  onReplySubmitted?: (reviewId: string, reply: string) => void
}

const sentimentVariants: Record<string, 'success' | 'warning' | 'danger' | 'secondary'> = {
  positive: 'success',
  neutral: 'warning',
  negative: 'danger',
}

const sourceLabels: Record<string, string> = {
  google: 'Google',
  facebook: 'Facebook',
  yelp: 'Yelp',
  manual: 'Manual',
}

const sourceColors: Record<string, string> = {
  google: 'bg-blue-50 text-blue-700 border-blue-200',
  facebook: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  yelp: 'bg-red-50 text-red-700 border-red-200',
  manual: 'bg-gray-50 text-gray-700 border-gray-200',
}

export function ReviewCard({ review, brandVoice, onReplySubmitted }: ReviewCardProps) {
  const rating = review.rating ?? 0

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-gray-900 truncate">
              {review.author_name ?? 'Anonymous'}
            </span>
            <span
              className={cn(
                'text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wide',
                sourceColors[review.source] ?? sourceColors.manual
              )}
            >
              {sourceLabels[review.source] ?? review.source}
            </span>
            {review.sentiment && (
              <Badge variant={sentimentVariants[review.sentiment]} className="capitalize">
                {review.sentiment}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={cn(
                    'w-4 h-4',
                    i < rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200'
                  )}
                />
              ))}
            </div>
            <span className="text-xs text-gray-500">
              {formatRelativeTime(review.posted_at)}
            </span>
          </div>
        </div>
      </div>

      {review.content && (
        <p className="mt-3 text-sm text-gray-700 leading-relaxed">{review.content}</p>
      )}

      {review.reply_content ? (
        <div className="mt-4 pl-4 border-l-2 border-emerald-200 bg-emerald-50/50 py-2 pr-2 rounded-r">
          <p className="text-xs font-medium text-emerald-700 mb-1">Your reply</p>
          <p className="text-sm text-gray-700">{review.reply_content}</p>
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-2">
          <AIReplyButton
            review={review}
            brandVoice={brandVoice}
            onReplySubmitted={onReplySubmitted}
          />
          {review.source === 'google' && (
            <a
              href="https://business.google.com/reviews"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
            >
              Reply on Google <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}
    </Card>
  )
}
