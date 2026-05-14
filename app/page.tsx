import Link from 'next/link'
import { Inbox, Sparkles, BarChart3, Bell, MessageSquare, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PricingTable } from '@/components/PricingTable'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
              <span className="text-white font-bold text-sm">R</span>
            </div>
            <span className="font-semibold text-[#0F172A]">ReviewPilot AI</span>
          </Link>
          <nav className="flex items-center gap-6">
            <a href="#features" className="text-sm text-gray-600 hover:text-gray-900">Features</a>
            <a href="#pricing" className="text-sm text-gray-600 hover:text-gray-900">Pricing</a>
            <Link href="/auth/signin">
              <Button variant="outline" size="sm">Sign in</Button>
            </Link>
            <Link href="/auth/signin">
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">Get started</Button>
            </Link>
          </nav>
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-6 py-24 text-center">
        <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-medium mb-6">
          <Sparkles className="w-3.5 h-3.5" />
          AI-powered review management
        </div>
        <h1 className="text-5xl md:text-6xl font-bold text-[#0F172A] tracking-tight">
          Collect reviews automatically.<br />
          <span className="text-emerald-600">Respond instantly.</span> Grow locally.
        </h1>
        <p className="mt-6 text-lg text-gray-600 max-w-2xl mx-auto">
          ReviewPilot AI helps local service businesses turn happy customers into 5-star reviews —
          and gives you AI-drafted replies to every review across Google, Facebook, and Yelp.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link href="/auth/signin">
            <Button size="lg" className="bg-emerald-600 hover:bg-emerald-700">
              Start free trial
            </Button>
          </Link>
          <a href="#features">
            <Button size="lg" variant="outline">See how it works</Button>
          </a>
        </div>
      </section>

      <section id="features" className="bg-gray-50 py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-[#0F172A]">Everything you need to win local search</h2>
            <p className="mt-3 text-gray-600">Five features. One unified dashboard.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="bg-white rounded-xl p-6 border border-gray-100">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center mb-4">
                  <feature.icon className="w-5 h-5 text-emerald-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-1.5">{feature.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-[#0F172A]">Simple, transparent pricing</h2>
            <p className="mt-3 text-gray-600">Start free for 14 days. No credit card required.</p>
          </div>
          <PricingTableClientWrapper />
        </div>
      </section>

      <footer className="border-t border-gray-100 py-8">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between text-sm text-gray-500">
          <span>© {new Date().getFullYear()} ReviewPilot AI</span>
          <div className="flex gap-6">
            <a href="#" className="hover:text-gray-900">Privacy</a>
            <a href="#" className="hover:text-gray-900">Terms</a>
            <a href="#" className="hover:text-gray-900">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

const FEATURES = [
  {
    icon: Inbox,
    title: 'Unified Review Inbox',
    description: 'See every Google, Facebook, and Yelp review in one feed. Filter by rating, source, or sentiment.',
  },
  {
    icon: Sparkles,
    title: 'AI Response Drafts',
    description: 'One click generates 3 reply options tuned to your brand voice. Edit and publish in seconds.',
  },
  {
    icon: MessageSquare,
    title: 'Automated Requests',
    description: 'Send SMS or email review invites 24-48 hours after service. Track open and click rates.',
  },
  {
    icon: Bell,
    title: 'Negative Review Alerts',
    description: 'Get an instant email the moment a 1- or 2-star review appears so you can respond before damage spreads.',
  },
  {
    icon: BarChart3,
    title: 'Sentiment Analytics',
    description: 'Track rating trends and response times. Export white-label reports for clients on the Agency plan.',
  },
  {
    icon: Star,
    title: 'Multi-Location Ready',
    description: 'Manage 1 to 10 locations from a single workspace. Team seats included on Pro and Agency.',
  },
]

function PricingTableClientWrapper() {
  return <PricingTable />
}
