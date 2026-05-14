import Link from 'next/link'
import { Star, MessageSquare, Send, TrendingUp, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertBanner } from '@/components/AlertBanner'
import { Button } from '@/components/ui/button'
import { formatRelativeTime, cn } from '@/lib/utils'
import type { Review } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

export default async function DashboardOverview() {
  const supabase = await createClient()
  const { data: orgId } = await supabase.rpc('get_user_org_id')
  if (!orgId) return <p className="text-sm text-gray-500">Setting up your organization…</p>

  const [
    { data: locations },
    { count: reviewCount },
    { data: ratingData },
    { data: recentReviews },
    { data: negativeReviews },
    { count: requestsThisMonth },
  ] = await Promise.all([
    supabase.from('locations').select('id, name, rating_avg, review_count').eq('org_id', orgId),
    supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    supabase.from('reviews').select('rating').eq('org_id', orgId).not('rating', 'is', null),
    supabase
      .from('reviews')
      .select('*')
      .eq('org_id', orgId)
      .order('posted_at', { ascending: false, nullsFirst: false })
      .limit(5),
    supabase
      .from('reviews')
      .select('*')
      .eq('org_id', orgId)
      .eq('sentiment', 'negative')
      .is('reply_content', null)
      .limit(20),
    supabase
      .from('review_requests')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('sent_at', startOfMonthISO()),
  ])

  const ratings = (ratingData ?? []) as Array<{ rating: number | null }>
  const avgRating = ratings.length
    ? ratings.reduce((sum: number, r) => sum + (r.rating ?? 0), 0) / ratings.length
    : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
        <p className="text-sm text-gray-500 mt-1">A snapshot of your reviews and requests.</p>
      </div>

      <AlertBanner negativeReviews={(negativeReviews ?? []) as Review[]} />

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Star}
          label="Average rating"
          value={avgRating ? avgRating.toFixed(1) : '—'}
          accent="text-amber-500"
        />
        <StatCard
          icon={MessageSquare}
          label="Total reviews"
          value={String(reviewCount ?? 0)}
          accent="text-emerald-500"
        />
        <StatCard
          icon={Send}
          label="Requests this month"
          value={String(requestsThisMonth ?? 0)}
          accent="text-blue-500"
        />
        <StatCard
          icon={MapPin}
          label="Active locations"
          value={String(locations?.length ?? 0)}
          accent="text-purple-500"
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Recent reviews</h2>
            <Link href="/dashboard/inbox" className="text-sm text-emerald-600 hover:underline">
              View all
            </Link>
          </div>
          {(recentReviews ?? []).length === 0 ? (
            <EmptyState
              title="No reviews yet"
              description="Connect a location or add a manual review to get started."
              cta={{ href: '/dashboard/locations', label: 'Add a location' }}
            />
          ) : (
            <ul className="divide-y divide-gray-100">
              {((recentReviews ?? []) as Review[]).map((r) => (
                <li key={r.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{r.author_name ?? 'Anonymous'}</span>
                    <div className="flex">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={cn(
                            'w-3.5 h-3.5',
                            i < (r.rating ?? 0)
                              ? 'text-amber-400 fill-amber-400'
                              : 'text-gray-200'
                          )}
                        />
                      ))}
                    </div>
                    {r.sentiment && (
                      <Badge
                        variant={
                          r.sentiment === 'positive'
                            ? 'success'
                            : r.sentiment === 'negative'
                              ? 'danger'
                              : 'warning'
                        }
                        className="capitalize text-[10px]"
                      >
                        {r.sentiment}
                      </Badge>
                    )}
                    <span className="text-xs text-gray-500 ml-auto">
                      {formatRelativeTime(r.posted_at)}
                    </span>
                  </div>
                  {r.content && (
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">{r.content}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Your locations</h2>
            <Link href="/dashboard/locations" className="text-sm text-emerald-600 hover:underline">
              Manage
            </Link>
          </div>
          {(locations ?? []).length === 0 ? (
            <EmptyState
              title="No locations"
              description="Add your first business location."
              cta={{ href: '/dashboard/locations', label: 'Add location' }}
            />
          ) : (
            <ul className="space-y-3">
              {((locations ?? []) as Array<{ id: string; name: string; rating_avg: number | null; review_count: number }>).map((loc) => (
                <li key={loc.id} className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{loc.name}</p>
                    <p className="text-xs text-gray-500">
                      {loc.review_count} reviews · {(loc.rating_avg ?? 0).toFixed(1)}★ avg
                    </p>
                  </div>
                  <TrendingUp className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  accent: string
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 uppercase font-medium tracking-wide">{label}</p>
        <Icon className={cn('w-4 h-4', accent)} />
      </div>
      <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>
    </Card>
  )
}

function EmptyState({
  title,
  description,
  cta,
}: {
  title: string
  description: string
  cta: { href: string; label: string }
}) {
  return (
    <div className="text-center py-6">
      <p className="text-sm font-medium text-gray-900">{title}</p>
      <p className="text-xs text-gray-500 mt-1 mb-3">{description}</p>
      <Link href={cta.href}>
        <Button size="sm" variant="outline">
          {cta.label}
        </Button>
      </Link>
    </div>
  )
}

function startOfMonthISO() {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}
