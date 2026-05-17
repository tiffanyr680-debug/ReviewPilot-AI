'use client'

import { useMemo, useState } from 'react'
import { ReviewCard } from '@/components/ReviewCard'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Inbox } from 'lucide-react'
import type { Review } from '@/lib/db-types'

interface InboxClientProps {
  initialReviews: Review[]
  brandVoice: string
  locations: { id: string; name: string }[]
}

export function InboxClient({ initialReviews, brandVoice, locations }: InboxClientProps) {
  const [reviews, setReviews] = useState(initialReviews)
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [sentimentFilter, setSentimentFilter] = useState<string>('all')
  const [locationFilter, setLocationFilter] = useState<string>('all')

  const filtered = useMemo(() => {
    return reviews.filter((r) => {
      if (sourceFilter !== 'all' && r.source !== sourceFilter) return false
      if (sentimentFilter !== 'all' && r.sentiment !== sentimentFilter) return false
      if (locationFilter !== 'all' && r.location_id !== locationFilter) return false
      return true
    })
  }, [reviews, sourceFilter, sentimentFilter, locationFilter])

  function handleReplySubmitted(reviewId: string, reply: string) {
    setReviews((prev) =>
      prev.map((r) => (r.id === reviewId ? { ...r, reply_content: reply } : r))
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Review Inbox</h1>
          <p className="text-sm text-gray-500 mt-1">
            {filtered.length} of {reviews.length} reviews
          </p>
        </div>
      </div>

      <Card className="p-4">
        <div className="grid sm:grid-cols-3 gap-3">
          <FilterSelect
            label="Source"
            value={sourceFilter}
            onChange={setSourceFilter}
            options={[
              { value: 'all', label: 'All sources' },
              { value: 'google', label: 'Google' },
              { value: 'facebook', label: 'Facebook' },
              { value: 'yelp', label: 'Yelp' },
              { value: 'manual', label: 'Manual' },
            ]}
          />
          <FilterSelect
            label="Sentiment"
            value={sentimentFilter}
            onChange={setSentimentFilter}
            options={[
              { value: 'all', label: 'All sentiments' },
              { value: 'positive', label: 'Positive' },
              { value: 'neutral', label: 'Neutral' },
              { value: 'negative', label: 'Negative' },
            ]}
          />
          <FilterSelect
            label="Location"
            value={locationFilter}
            onChange={setLocationFilter}
            options={[
              { value: 'all', label: 'All locations' },
              ...locations.map((l) => ({ value: l.id, label: l.name })),
            ]}
          />
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <Inbox className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-900">No reviews match your filters</p>
          <p className="text-xs text-gray-500 mt-1">
            Try clearing filters, syncing reviews, or adding a manual entry.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              brandVoice={brandVoice}
              onReplySubmitted={handleReplySubmitted}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5 block">
        {label}
      </label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
