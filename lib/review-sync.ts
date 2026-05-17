import { classifySentiment } from './ai/provider'
import { queryMany, execute } from '@/lib/db'
import { newId } from '@/lib/auth'

interface GoogleReview {
  author_name: string
  rating: number
  text: string
  time: number
}

export async function syncGoogleReviews(
  locationId: string,
  orgId: string,
  googlePlaceId: string,
): Promise<number> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return 0

  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${googlePlaceId}&fields=reviews&key=${apiKey}`
  const res = await fetch(url)
  if (!res.ok) return 0

  const data = (await res.json()) as { result?: { reviews?: GoogleReview[] } }
  const reviews = data.result?.reviews ?? []

  let synced = 0
  for (const r of reviews) {
    const sentiment = classifySentiment(r.rating, r.text)
    const postedAt = new Date(r.time * 1000).toISOString()

    const result = await execute(
      `INSERT INTO reviews
         (id, location_id, org_id, source, author_name, rating, content, sentiment, posted_at)
       VALUES (?, ?, ?, 'google', ?, ?, ?, ?, ?)
       ON CONFLICT(location_id, source, author_name, posted_at) DO NOTHING`,
      [newId(), locationId, orgId, r.author_name, r.rating, r.text, sentiment, postedAt],
    )
    if (result.rowsAffected > 0) synced++
  }

  if (synced > 0) await updateLocationStats(locationId)
  return synced
}

export async function syncFacebookReviews(
  locationId: string,
  orgId: string,
  pageId: string,
): Promise<number> {
  const accessToken = process.env.FACEBOOK_ACCESS_TOKEN
  if (!accessToken) return 0

  const url = `https://graph.facebook.com/v18.0/${pageId}/ratings?fields=reviewer,rating,review_text,created_time&access_token=${accessToken}`
  const res = await fetch(url)
  if (!res.ok) return 0

  const data = (await res.json()) as {
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

    const result = await execute(
      `INSERT INTO reviews
         (id, location_id, org_id, source, author_name, rating, content, sentiment, posted_at)
       VALUES (?, ?, ?, 'facebook', ?, ?, ?, ?, ?)
       ON CONFLICT(location_id, source, author_name, posted_at) DO NOTHING`,
      [
        newId(),
        locationId,
        orgId,
        r.reviewer.name,
        r.rating,
        r.review_text,
        sentiment,
        r.created_time,
      ],
    )
    if (result.rowsAffected > 0) synced++
  }

  if (synced > 0) await updateLocationStats(locationId)
  return synced
}

async function updateLocationStats(locationId: string): Promise<void> {
  const rows = await queryMany<{ rating: number | null }>(
    'SELECT rating FROM reviews WHERE location_id = ? AND rating IS NOT NULL',
    [locationId],
  )
  if (rows.length === 0) return

  const avg = rows.reduce((sum, r) => sum + (r.rating ?? 0), 0) / rows.length
  await execute('UPDATE locations SET rating_avg = ?, review_count = ? WHERE id = ?', [
    Math.round(avg * 100) / 100,
    rows.length,
    locationId,
  ])
}
