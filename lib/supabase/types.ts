export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          owner_id: string
          brand_voice: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          owner_id: string
          brand_voice?: string
          created_at?: string
        }
        Update: {
          name?: string
          brand_voice?: string
        }
      }
      organization_members: {
        Row: {
          id: string
          org_id: string
          user_id: string
          role: 'owner' | 'admin' | 'member'
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          user_id: string
          role?: 'owner' | 'admin' | 'member'
          created_at?: string
        }
        Update: {
          role?: 'owner' | 'admin' | 'member'
        }
      }
      locations: {
        Row: {
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
        Insert: {
          id?: string
          org_id: string
          name: string
          address?: string | null
          google_place_id?: string | null
          facebook_page_id?: string | null
          rating_avg?: number
          review_count?: number
          created_at?: string
        }
        Update: {
          name?: string
          address?: string | null
          google_place_id?: string | null
          facebook_page_id?: string | null
          rating_avg?: number
          review_count?: number
        }
      }
      reviews: {
        Row: {
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
        Insert: {
          id?: string
          location_id: string
          org_id: string
          source: 'google' | 'facebook' | 'yelp' | 'manual'
          author_name?: string | null
          rating?: number | null
          content?: string | null
          reply_content?: string | null
          sentiment?: 'positive' | 'neutral' | 'negative' | null
          posted_at?: string | null
          synced_at?: string
        }
        Update: {
          reply_content?: string | null
          sentiment?: 'positive' | 'neutral' | 'negative' | null
        }
      }
      review_requests: {
        Row: {
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
        Insert: {
          id?: string
          org_id: string
          location_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_email?: string | null
          template_id?: string | null
          status?: 'pending' | 'sent' | 'opened' | 'clicked' | 'completed' | 'failed'
          sent_at?: string | null
          created_at?: string
        }
        Update: {
          status?: 'pending' | 'sent' | 'opened' | 'clicked' | 'completed' | 'failed'
          sent_at?: string | null
        }
      }
      request_templates: {
        Row: {
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
        Insert: {
          id?: string
          org_id: string
          name: string
          sms_body?: string | null
          email_subject?: string | null
          email_body?: string | null
          trigger_delay_hours?: number
          active?: boolean
          created_at?: string
        }
        Update: {
          name?: string
          sms_body?: string | null
          email_subject?: string | null
          email_body?: string | null
          trigger_delay_hours?: number
          active?: boolean
        }
      }
      subscriptions: {
        Row: {
          id: string
          org_id: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          status: string
          plan: 'starter' | 'pro' | 'agency'
          current_period_end: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          status?: string
          plan?: 'starter' | 'pro' | 'agency'
          current_period_end?: string | null
          updated_at?: string
        }
        Update: {
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          status?: string
          plan?: 'starter' | 'pro' | 'agency'
          current_period_end?: string | null
          updated_at?: string
        }
      }
      audit_logs: {
        Row: {
          id: string
          org_id: string
          user_id: string | null
          action: string
          entity_type: string | null
          entity_id: string | null
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          user_id?: string | null
          action: string
          entity_type?: string | null
          entity_id?: string | null
          metadata?: Json | null
          created_at?: string
        }
        Update: never
      }
    }
    Views: Record<string, never>
    Functions: {
      get_user_org_id: {
        Args: Record<string, never>
        Returns: string
      }
    }
    Enums: Record<string, never>
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type Inserts<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type Updates<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']

export type Organization = Tables<'organizations'>
export type Location = Tables<'locations'>
export type Review = Tables<'reviews'>
export type ReviewRequest = Tables<'review_requests'>
export type RequestTemplate = Tables<'request_templates'>
export type Subscription = Tables<'subscriptions'>
export type AuditLog = Tables<'audit_logs'>
export type OrganizationMember = Tables<'organization_members'>
