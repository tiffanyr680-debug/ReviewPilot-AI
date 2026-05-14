import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRating(rating: number): string {
  return rating.toFixed(1)
}

export function formatDate(date: string | null): string {
  if (!date) return 'Unknown date'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date))
}

export function formatRelativeTime(date: string | null): string {
  if (!date) return ''
  const now = new Date()
  const then = new Date(date)
  const diffMs = now.getTime() - then.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  return formatDate(date)
}

export type Plan = 'starter' | 'pro' | 'agency'

export interface TierLimits {
  locations: number
  requestsPerMonth: number
  sms: boolean
  sentimentAnalytics: boolean
  whiteLabel: boolean
  teamSeats: number
}

export function getTierLimits(plan: Plan): TierLimits {
  const limits: Record<Plan, TierLimits> = {
    starter: { locations: 1, requestsPerMonth: 100, sms: false, sentimentAnalytics: false, whiteLabel: false, teamSeats: 1 },
    pro:     { locations: 3, requestsPerMonth: 500, sms: true, sentimentAnalytics: true, whiteLabel: false, teamSeats: 3 },
    agency:  { locations: 10, requestsPerMonth: Infinity, sms: true, sentimentAnalytics: true, whiteLabel: true, teamSeats: 10 },
  }
  return limits[plan]
}

export function sentimentColor(sentiment: string | null): string {
  if (sentiment === 'positive') return 'text-emerald-600'
  if (sentiment === 'negative') return 'text-red-500'
  return 'text-amber-500'
}

export function ratingStars(rating: number | null): string {
  if (!rating) return ''
  return '★'.repeat(rating) + '☆'.repeat(5 - rating)
}
