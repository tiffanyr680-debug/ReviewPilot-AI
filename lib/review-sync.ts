import { classifySentiment } from './ai/provider'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any

interface GoogleReview {
  author_name: string
  rating: number
  text: string
  time: number
}

export async function syncGoogleReviews(
  supabase: DB,
  locationId: string,
  orgId: string,
  googlePlaceId: string
): Promise<number> {
  // In production: call Google My Business API with OAuth2
  // Here: return 0 if no API key configured (manual entry fallback)
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return 0

  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${googlePlaceId}&fields=reviews&key=${apiKey}`
  const res = await fetch(url)
  if (!res.ok) return 0

  const data = await res.json() as { result?: { reviews?: GoogleReview[] } }
  const reviews = data.result?.reviews ?? []

  let synced = 0
  for (const r of reviews) {
    const sentiment = classifySentiment(r.rating, r.text)
    const postedAt = new Date(r.time * 1000).toISOString()

    const { error } = await supabase.from('reviews').upsert({
      location_id: locationId,
      org_id: orgId,
      source: 'google',
      author_name: r.author_name,
      rating: r.rating,
      content: r.text,
      sentiment,
      posted_at: postedAt,
    }, { onConflict: 'location_id,source,author_name,posted_at' })

    if (!error) synced++
  }

  if (synced > 0) {
    await updateLocationStats(supabase, locationId)
  }

  return synced
}

export async function syncFacebookReviews(
  supabase: DB,
  locationId: string,
  orgId: string,
  pageId: string
): Promise<number> {
  // In production: call Facebook Graph API with page access token
  const accessToken = process.env.FACEBOOK_ACCESS_TOKEN
  if (!accessToken) return 0

  const url = `https://graph.facebook.com/v18.0/${pageId}/ratings?fields=reviewer,rating,review_text,created_time&access_token=${accessToken}`
  const res = await fetch(url)
  if (!res.ok) return 0

  const data = await res.json() as {
    data?: Array<{
      reviewer: { name: string }
      rating: number
      review_text: string
      created_time: string
    }>
  }

  let synced = 0
  for (const r of data.data ?? []) {
    const sentiment = classifySentiment(r.rating, r.review_text)

    const { error } = await supabase.from('reviews').upsert({
      location_id: locationId,
      org_id: orgId,
      source: 'facebook',
      author_name: r.reviewer.name,
      rating: r.rating,
      content: r.review_text,
      sentiment,
      posted_at: r.created_time,
    }, { onConflict: 'location_id,source,author_name,posted_at' })

    if (!error) synced++
  }

  if (synced > 0) {
    await updateLocationStats(supabase, locationId)
  }

  return synced
}

async function updateLocationStats(supabase: DB, locationId: string) {
  const { data } = await supabase
    .from('reviews')
    .select('rating')
    .eq('location_id', locationId)
    .not('rating', 'is', null)

  if (!data || data.length === 0) return

  const avg = data.reduce((sum: number, r: { rating: number | null }) => sum + (r.rating ?? 0), 0) / data.length

  await supabase
    .from('locations')
    .update({ rating_avg: Math.round(avg * 100) / 100, review_count: data.length })
    .eq('id', locationId)
}
