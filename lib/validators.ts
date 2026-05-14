import { z } from 'zod'

export const CreateLocationSchema = z.object({
  name: z.string().min(1).max(100),
  address: z.string().max(200).optional(),
  google_place_id: z.string().max(200).optional(),
  facebook_page_id: z.string().max(200).optional(),
})

export const SendRequestSchema = z.object({
  customer_name: z.string().min(1).max(100),
  customer_phone: z.string().regex(/^\+?[1-9]\d{7,14}$/).optional(),
  customer_email: z.string().email().optional(),
  template_id: z.string().uuid(),
  location_id: z.string().uuid(),
}).refine(data => data.customer_phone || data.customer_email, {
  message: 'Either phone or email is required',
})

export const DraftResponseSchema = z.object({
  review_id: z.string().uuid(),
  review_text: z.string().min(1).max(5000),
  rating: z.number().int().min(1).max(5),
  source: z.enum(['google', 'facebook', 'yelp', 'manual']),
})

export const CreateTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  sms_body: z.string().max(160).optional(),
  email_subject: z.string().max(200).optional(),
  email_body: z.string().max(2000).optional(),
  trigger_delay_hours: z.number().int().min(1).max(168).default(24),
  active: z.boolean().default(true),
})

export const UpdateBrandVoiceSchema = z.object({
  brand_voice: z.string().min(10).max(500),
})

export const SyncReviewsSchema = z.object({
  location_id: z.string().uuid().optional(),
})

export const ManualReviewSchema = z.object({
  location_id: z.string().uuid(),
  author_name: z.string().min(1).max(100),
  rating: z.number().int().min(1).max(5),
  content: z.string().max(5000).optional(),
  source: z.enum(['google', 'facebook', 'yelp', 'manual']).default('manual'),
  posted_at: z.string().datetime().optional(),
})
