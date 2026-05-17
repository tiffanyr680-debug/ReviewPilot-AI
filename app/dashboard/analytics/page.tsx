import { redirect } from 'next/navigation'
import { getSession, getCurrentOrgId } from '@/lib/auth'
import { queryMany, queryOne } from '@/lib/db'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SentimentChart } from '@/components/SentimentChart'
import { Star, TrendingUp, TrendingDown, Minus, Lock } from 'lucide-react'
import Link from 'next/link'
import { cn, getTierLimits } from '@/lib/utils'

export const dynamic = 'force-dynamic'

type SentimentRow = { sentiment: 'positive' | 'neutral' | 'negative' | null; posted_at: string | null; rating: number | null }

export default async function AnalyticsPage() {
  const session = await getSession()
  if (!session) redirect('/auth/signin')
  const orgId = await getCurrentOrgId(session.userId)
  if (!orgId) return <p className="text-sm text-gray-500">Loading…</p>

  const sub = await queryOne<{ plan: string }>(
    'SELECT plan FROM subscriptions WHERE org_id = ?',
    [orgId],
  )
  const plan = (sub?.plan ?? 'starter') as 'starter' | 'pro' | 'agency'
  const limits = getTierLimits(plan)

  if (!limits.sentimentAnalytics) {
    return <SentimentLocked currentPlan={plan} />
  }

  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const reviews = await queryMany<SentimentRow>(
    `SELECT sentiment, posted_at, rating FROM reviews
      WHERE org_id = ? AND posted_at >= ?
      ORDER BY posted_at ASC`,
    [orgId, ninetyDaysAgo.toISOString()],
  )

  const rows = (reviews ?? []) as SentimentRow[]

  const totals = rows.reduce(
    (acc, r) => {
      if (r.sentiment) acc[r.sentiment]++
      return acc
    },
    { positive: 0, neutral: 0, negative: 0 }
  )

  const totalRated = rows.filter((r) => r.rating).length
  const avgRating = totalRated
    ? rows.reduce((sum, r) => sum + (r.rating ?? 0), 0) / totalRated
    : 0

  const trendData = buildWeeklyTrend(rows)

  const positivePct = rows.length ? Math.round((totals.positive / rows.length) * 100) : 0
  const negativePct = rows.length ? Math.round((totals.negative / rows.length) * 100) : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">Last 90 days of review activity.</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={Star}
          label="Average rating"
          value={avgRating ? avgRating.toFixed(2) : '—'}
          tone="amber"
        />
        <KpiCard
          icon={TrendingUp}
          label="Positive"
          value={`${totals.positive}`}
          subtitle={`${positivePct}% of total`}
          tone="emerald"
        />
        <KpiCard
          icon={Minus}
          label="Neutral"
          value={`${totals.neutral}`}
          tone="amber"
        />
        <KpiCard
          icon={TrendingDown}
          label="Negative"
          value={`${totals.negative}`}
          subtitle={`${negativePct}% of total`}
          tone="red"
        />
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Sentiment trend</h2>
          <Badge variant="secondary">Weekly</Badge>
        </div>
        <SentimentChart data={trendData} />
      </Card>

      {plan === 'agency' && (
        <Card className="p-5">
          <h2 className="font-semibold text-gray-900 mb-2">White-label export</h2>
          <p className="text-sm text-gray-500 mb-3">
            Generate a branded monthly report for your clients.
          </p>
          <p className="text-xs text-gray-400">
            Coming soon — PDF export with your own logo.
          </p>
        </Card>
      )}
    </div>
  )
}

function buildWeeklyTrend(rows: SentimentRow[]) {
  const buckets = new Map<string, { positive: number; neutral: number; negative: number }>()
  for (const r of rows) {
    if (!r.posted_at || !r.sentiment) continue
    const d = new Date(r.posted_at)
    const weekStart = new Date(d)
    weekStart.setDate(d.getDate() - d.getDay())
    weekStart.setHours(0, 0, 0, 0)
    const key = weekStart.toISOString().slice(0, 10)
    const bucket = buckets.get(key) ?? { positive: 0, neutral: 0, negative: 0 }
    bucket[r.sentiment]++
    buckets.set(key, bucket)
  }
  return Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, counts]) => ({
      date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      ...counts,
    }))
}

function KpiCard({
  icon: Icon,
  label,
  value,
  subtitle,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  subtitle?: string
  tone: 'emerald' | 'amber' | 'red'
}) {
  const toneColors: Record<typeof tone, string> = {
    emerald: 'text-emerald-500',
    amber: 'text-amber-500',
    red: 'text-red-500',
  }
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 uppercase font-medium tracking-wide">{label}</p>
        <Icon className={cn('w-4 h-4', toneColors[tone])} />
      </div>
      <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>
      {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
    </Card>
  )
}

function SentimentLocked({ currentPlan }: { currentPlan: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">Sentiment analytics requires the Pro plan.</p>
      </div>
      <Card className="p-10 text-center">
        <Lock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-base font-semibold text-gray-900">
          You&apos;re on the {currentPlan} plan
        </p>
        <p className="text-sm text-gray-500 mt-1 mb-4 max-w-sm mx-auto">
          Upgrade to Pro to unlock sentiment trends, KPI dashboards, and exportable reports.
        </p>
        <Link
          href="/dashboard/settings"
          className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-md text-sm font-medium"
        >
          Upgrade plan
        </Link>
      </Card>
    </div>
  )
}
