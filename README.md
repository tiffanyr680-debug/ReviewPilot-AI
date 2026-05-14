# ReviewPilot AI

**Collect reviews automatically. Respond instantly. Grow locally.**

ReviewPilot AI is a multi-tenant SaaS platform that helps local service businesses automate their review collection and response workflow. Send branded SMS/email requests, monitor new reviews from Google and Facebook, and generate AI-powered reply drafts — all from one unified dashboard.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, Server Actions) |
| Language | TypeScript 5.3 (strict) |
| Database | Supabase (Postgres + Row Level Security) |
| Auth | Supabase Auth |
| AI | Anthropic Claude (claude-opus-4-7) |
| Payments | Stripe (Checkout + Webhooks) |
| Email | Resend |
| SMS | Twilio |
| Charts | Recharts |
| UI | Tailwind CSS + shadcn/ui + Radix UI |
| Deployment | Vercel (with cron jobs) |

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/your-org/reviewpilot-ai.git
cd reviewpilot-ai
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in all values — see the [Environment Variables](#environment-variables) table below.

### 3. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Copy your project URL and anon key into `.env.local`
3. Run the migration in the Supabase SQL editor:

```bash
# Copy and paste the contents of supabase/migrations/001_schema.sql
# into the Supabase SQL editor, then click Run
```

4. Copy your service role key from **Project Settings → API** into `SUPABASE_SERVICE_ROLE_KEY`

### 4. Set up Stripe

1. Create a [Stripe](https://stripe.com) account
2. Create products and prices for Starter, Pro, and Agency (monthly + yearly)
3. Copy each price ID into the corresponding `STRIPE_PRICE_*` env var
4. Install the Stripe CLI and forward webhooks locally:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

5. Copy the webhook signing secret into `STRIPE_WEBHOOK_SECRET`

### 5. Set up Resend

1. Create a [Resend](https://resend.com) account
2. Verify your sending domain
3. Copy your API key into `RESEND_API_KEY`
4. Set `RESEND_FROM_EMAIL` to a verified sender address

### 6. Set up Twilio (Pro + Agency plans)

1. Create a [Twilio](https://twilio.com) account
2. Purchase a phone number
3. Copy your Account SID, Auth Token, and phone number into the `TWILIO_*` env vars

### 7. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 8. Deploy to Vercel

```bash
npx vercel --prod
```

Add all environment variables in the Vercel dashboard under **Project → Settings → Environment Variables**. The `vercel.json` cron will automatically sync reviews every 6 hours.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-only, never expose) |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for AI reply drafts |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key (use `sk_test_` in dev) |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook signing secret |
| `STRIPE_PRICE_STARTER_MONTHLY` | Yes | Stripe price ID for Starter monthly plan |
| `STRIPE_PRICE_STARTER_YEARLY` | Yes | Stripe price ID for Starter yearly plan |
| `STRIPE_PRICE_PRO_MONTHLY` | Yes | Stripe price ID for Pro monthly plan |
| `STRIPE_PRICE_PRO_YEARLY` | Yes | Stripe price ID for Pro yearly plan |
| `STRIPE_PRICE_AGENCY_MONTHLY` | Yes | Stripe price ID for Agency monthly plan |
| `STRIPE_PRICE_AGENCY_YEARLY` | Yes | Stripe price ID for Agency yearly plan |
| `RESEND_API_KEY` | Yes | Resend API key for transactional email |
| `RESEND_FROM_EMAIL` | Yes | Verified sender address for outbound emails |
| `TWILIO_ACCOUNT_SID` | Pro/Agency | Twilio Account SID for SMS |
| `TWILIO_AUTH_TOKEN` | Pro/Agency | Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | Pro/Agency | Twilio phone number (E.164 format, e.g. `+15551234567`) |
| `NEXT_PUBLIC_APP_URL` | Yes | Public URL of your deployed app (no trailing slash) |
| `CRON_SECRET` | Yes | Random secret to authenticate Vercel cron requests |
| `GOOGLE_MAPS_API_KEY` | Optional | Google Maps API key for Places review sync |
| `FACEBOOK_ACCESS_TOKEN` | Optional | Facebook page access token for review sync |

---

## Feature Tiers

| Feature | Starter ($29/mo) | Pro ($59/mo) | Agency ($149/mo) |
|---|---|---|---|
| Locations | 1 | 3 | 10 |
| Review requests/month | 100 | 500 | Unlimited |
| SMS requests | No | Yes | Yes |
| Email requests | Yes | Yes | Yes |
| AI reply drafts | Yes | Yes | Yes |
| Sentiment analytics | No | Yes | Yes |
| Unified review inbox | Yes | Yes | Yes |
| White-label reports | No | No | Yes |
| Team seats | 1 | 3 | 10 |
| Priority support | No | No | Yes |

---

## API Route Reference

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/auth/callback` | Supabase OAuth callback handler | Public |
| `GET` | `/api/reviews/sync` | Cron: sync reviews from Google + Facebook | Cron secret |
| `POST` | `/api/reviews/draft` | Generate AI reply drafts for a review | Session |
| `POST` | `/api/reviews/reply` | Save a reply to a review | Session |
| `POST` | `/api/requests/send` | Send a review request via SMS/email | Session |
| `POST` | `/api/locations` | Create a new location | Session |
| `DELETE` | `/api/locations/[id]` | Delete a location | Session |
| `POST` | `/api/templates` | Create a request template | Session |
| `PUT` | `/api/templates/[id]` | Update a request template | Session |
| `POST` | `/api/billing/checkout` | Create a Stripe Checkout session | Session |
| `POST` | `/api/billing/portal` | Create a Stripe Customer Portal session | Session |
| `POST` | `/api/webhooks/stripe` | Stripe webhook handler | Stripe signature |
| `GET` | `/api/analytics/summary` | Get org-level analytics summary | Session |

---

## Project Structure

```
reviewpilot-ai/
├── app/
│   ├── layout.tsx                  # Root layout + metadata
│   ├── globals.css                 # Tailwind base + CSS variables
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx              # Dashboard shell + sidebar
│   │   ├── dashboard/page.tsx      # Overview + stats
│   │   ├── inbox/page.tsx          # Unified review inbox
│   │   ├── requests/page.tsx       # Review request management
│   │   ├── locations/page.tsx      # Location management
│   │   ├── analytics/page.tsx      # Sentiment + trend charts
│   │   └── settings/
│   │       ├── page.tsx            # General settings
│   │       ├── brand/page.tsx      # Brand voice configuration
│   │       ├── billing/page.tsx    # Subscription management
│   │       └── team/page.tsx       # Team member management
│   └── api/
│       ├── auth/callback/route.ts
│       ├── reviews/
│       │   ├── sync/route.ts
│       │   ├── draft/route.ts
│       │   └── reply/route.ts
│       ├── requests/send/route.ts
│       ├── locations/
│       │   ├── route.ts
│       │   └── [id]/route.ts
│       ├── templates/
│       │   ├── route.ts
│       │   └── [id]/route.ts
│       ├── billing/
│       │   ├── checkout/route.ts
│       │   └── portal/route.ts
│       ├── webhooks/stripe/route.ts
│       └── analytics/summary/route.ts
├── components/
│   ├── ui/                         # shadcn/ui primitives
│   ├── reviews/
│   │   ├── ReviewCard.tsx
│   │   ├── ReplyEditor.tsx
│   │   └── StarRating.tsx
│   ├── dashboard/
│   │   ├── Sidebar.tsx
│   │   ├── StatsCards.tsx
│   │   └── SentimentChart.tsx
│   └── requests/
│       ├── SendRequestForm.tsx
│       └── RequestStatusBadge.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts               # Browser Supabase client
│   │   ├── server.ts               # Server Supabase client + service client
│   │   └── types.ts                # Full Database type definitions
│   ├── stripe/
│   │   └── client.ts               # Stripe client + pricing config
│   ├── ai/
│   │   └── provider.ts             # Anthropic client + AI functions
│   ├── utils.ts                    # cn(), formatDate(), tier limits
│   ├── validators.ts               # Zod schemas for all API inputs
│   ├── email.ts                    # Resend email helpers
│   ├── sms.ts                      # Twilio SMS helpers
│   └── review-sync.ts              # Google + Facebook review sync
├── supabase/
│   └── migrations/
│       └── 001_schema.sql          # Full schema with RLS policies
├── public/
│   └── manifest.json               # PWA manifest
├── .env.example                    # All required env vars documented
├── next.config.mjs
├── tailwind.config.ts
├── tsconfig.json
├── postcss.config.js
├── vercel.json                     # Cron schedule for review sync
└── components.json                 # shadcn/ui config
```

---

## Security Notes

- **Row Level Security** is enabled on every table. All queries are scoped to the authenticated user's organization via the `get_user_org_id()` helper function.
- **Service role key** is only used in server-side API routes that require bypassing RLS (e.g., Stripe webhook handler). It is never exposed to the browser.
- **Stripe webhooks** are verified using `stripe.webhooks.constructEvent()` with the signing secret before any data is processed.
- **Cron endpoints** are protected by a `CRON_SECRET` header check to prevent unauthorized triggering.
- **Input validation** uses Zod schemas on all API routes. Inputs are validated before any database or external API calls.
- **Environment variables** prefixed `NEXT_PUBLIC_` are safe to expose to the browser. All others are server-only.

---

## Development Commands

```bash
# Start development server
npm run dev

# Type-check without emitting (catch TypeScript errors)
npm run type-check

# Run ESLint
npm run lint

# Build for production
npm run build

# Start production server
npm start
```

---

## License

MIT
