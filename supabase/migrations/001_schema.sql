-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Organizations
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_voice TEXT DEFAULT 'We are a friendly, professional local service business. Our replies should be warm, grateful, and concise.',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Organization members (for team seats)
CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

-- Locations
CREATE TABLE locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  google_place_id TEXT,
  facebook_page_id TEXT,
  rating_avg DECIMAL(3,2) DEFAULT 0,
  review_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reviews
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('google','facebook','yelp','manual')),
  author_name TEXT,
  rating INT CHECK (rating BETWEEN 1 AND 5),
  content TEXT,
  reply_content TEXT,
  sentiment TEXT CHECK (sentiment IN ('positive','neutral','negative')),
  posted_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Review requests
CREATE TABLE review_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id),
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  template_id UUID,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','sent','opened','clicked','completed','failed')),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Request templates
CREATE TABLE request_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sms_body TEXT,
  email_subject TEXT,
  email_body TEXT,
  trigger_delay_hours INT DEFAULT 24,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subscriptions
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID UNIQUE NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  status TEXT DEFAULT 'inactive',
  plan TEXT DEFAULT 'starter' CHECK (plan IN ('starter','pro','agency')),
  current_period_end TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_reviews_location_source ON reviews(location_id, source);
CREATE INDEX idx_reviews_org_sentiment ON reviews(org_id, sentiment);
CREATE INDEX idx_reviews_org_posted ON reviews(org_id, posted_at DESC);
CREATE INDEX idx_requests_org_status ON review_requests(org_id, status);
CREATE INDEX idx_locations_org ON locations(org_id);
CREATE INDEX idx_members_user ON organization_members(user_id);

-- Enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper function: get current user's org_id
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID AS $$
  SELECT org_id FROM organization_members WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Organizations policies
CREATE POLICY "org_select" ON organizations FOR SELECT USING (id = get_user_org_id());
CREATE POLICY "org_insert" ON organizations FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "org_update" ON organizations FOR UPDATE USING (id = get_user_org_id() AND owner_id = auth.uid());

-- Organization members policies
CREATE POLICY "members_select" ON organization_members FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "members_insert" ON organization_members FOR INSERT WITH CHECK (org_id = get_user_org_id());
CREATE POLICY "members_delete" ON organization_members FOR DELETE USING (org_id = get_user_org_id());

-- Locations policies
CREATE POLICY "locations_all" ON locations FOR ALL USING (org_id = get_user_org_id()) WITH CHECK (org_id = get_user_org_id());

-- Reviews policies
CREATE POLICY "reviews_select" ON reviews FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "reviews_insert" ON reviews FOR INSERT WITH CHECK (org_id = get_user_org_id());
CREATE POLICY "reviews_update" ON reviews FOR UPDATE USING (org_id = get_user_org_id());

-- Review requests policies
CREATE POLICY "requests_all" ON review_requests FOR ALL USING (org_id = get_user_org_id()) WITH CHECK (org_id = get_user_org_id());

-- Request templates policies
CREATE POLICY "templates_all" ON request_templates FOR ALL USING (org_id = get_user_org_id()) WITH CHECK (org_id = get_user_org_id());

-- Subscriptions policies
CREATE POLICY "subs_select" ON subscriptions FOR SELECT USING (org_id = get_user_org_id());

-- Audit logs policies
CREATE POLICY "audit_select" ON audit_logs FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "audit_insert" ON audit_logs FOR INSERT WITH CHECK (org_id = get_user_org_id());
