export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface User {
  id: string
  email: string
  created_at: string
}

export interface Organization {
  id: string
  name: string
  owner_id: string | null
  brand_voice: string
  created_at: string
}

export interface OrganizationMember {
  id: string
  org_id: string
  user_id: string
  role: 'owner' | 'admin' | 'member'
  created_at: string
}

export interface Location {
  id: string
  org_id: string
  name: string
  address: string | null
  google_place_id: string | null
  facebook_page_id: string | null
  rating_avg: number
  review_count: number
  created_at: string
}

export interface Review {
  id: string
  location_id: string
  org_id: string
  source: 'google' | 'facebook' | 'yelp' | 'manual'
  author_name: string | null
  rating: number | null
  content: string | null
  reply_content: string | null
  sentiment: 'positive' | 'neutral' | 'negative' | null
  posted_at: string | null
  synced_at: string
}

export interface ReviewRequest {
  id: string
  org_id: string
  location_id: string | null
  customer_name: string | null
  customer_phone: string | null
  customer_email: string | null
  template_id: string | null
  status: 'pending' | 'sent' | 'opened' | 'clicked' | 'completed' | 'failed'
  sent_at: string | null
  created_at: string
}

/** As exposed to UI code. The DB stores `active` as INTEGER 0/1; convert at the
 *  query boundary (see app/dashboard/requests/page.tsx). */
export interface RequestTemplate {
  id: string
  org_id: string
  name: string
  sms_body: string | null
  email_subject: string | null
  email_body: string | null
  trigger_delay_hours: number
  active: boolean
  created_at: string
}

export interface Subscription {
  id: string
  org_id: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  status: string
  plan: 'starter' | 'pro' | 'agency'
  current_period_end: string | null
  updated_at: string
}

export interface AuditLog {
  id: string
  org_id: string
  user_id: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  metadata: Json | null
  created_at: string
}
