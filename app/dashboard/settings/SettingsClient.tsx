'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { PricingTable } from '@/components/PricingTable'
import { CheckCircle2, Loader2, CreditCard } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface Props {
  email: string
  orgName: string
  brandVoice: string
  plan: 'starter' | 'pro' | 'agency'
  status: string
  memberCount: number
  currentPeriodEnd: string | null
}

export function SettingsClient({
  email,
  orgName: initialOrgName,
  brandVoice: initialBrandVoice,
  plan,
  status,
  memberCount,
  currentPeriodEnd,
}: Props) {
  const [orgName, setOrgName] = useState(initialOrgName)
  const [brandVoice, setBrandVoice] = useState(initialBrandVoice)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [upgradeLoading, setUpgradeLoading] = useState<string | null>(null)

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    setSavingProfile(true)
    setProfileSaved(false)
    setProfileError(null)
    try {
      const res = await fetch('/api/org', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: orgName, brand_voice: brandVoice }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to save')
      }
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 3000)
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleUpgrade(
    selectedPlan: 'starter' | 'pro' | 'agency',
    interval: 'monthly' | 'yearly'
  ) {
    setUpgradeLoading(`${selectedPlan}-${interval}`)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: selectedPlan, interval }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to start checkout')
      if (data.url) window.location.href = data.url
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed')
    } finally {
      setUpgradeLoading(null)
    }
  }

  function handleManageBilling() {
    window.location.href = '/api/stripe/portal'
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Profile, billing, team, and brand voice configuration.
        </p>
      </div>

      <Card className="p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Profile</h2>
        <form onSubmit={handleSaveProfile} className="space-y-3 max-w-lg">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={email} disabled />
          </div>
          <div>
            <Label htmlFor="orgname">Organization name</Label>
            <Input
              id="orgname"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="brand">Brand voice</Label>
            <Textarea
              id="brand"
              value={brandVoice}
              onChange={(e) => setBrandVoice(e.target.value)}
              rows={4}
              maxLength={500}
              placeholder="Friendly and professional. Use first names. Always thank customers by name."
            />
            <p className="text-xs text-gray-500 mt-1">
              Used by the AI to draft replies in your tone. {brandVoice.length}/500
            </p>
          </div>
          {profileError && (
            <p className="text-sm text-red-600 bg-red-50 rounded p-2">{profileError}</p>
          )}
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              disabled={savingProfile}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save changes'}
            </Button>
            {profileSaved && (
              <span className="text-sm text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                Saved
              </span>
            )}
          </div>
        </form>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="font-semibold text-gray-900">Billing</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Current plan and subscription status.
            </p>
          </div>
          <Button
            onClick={handleManageBilling}
            variant="outline"
            className="gap-1.5"
            disabled={status === 'inactive' || status === 'trialing'}
          >
            <CreditCard className="w-4 h-4" />
            Manage billing
          </Button>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="rounded-lg border bg-gray-50 p-4">
            <p className="text-xs text-gray-500 uppercase font-medium">Plan</p>
            <p className="text-lg font-semibold text-gray-900 mt-1 capitalize">{plan}</p>
          </div>
          <div className="rounded-lg border bg-gray-50 p-4">
            <p className="text-xs text-gray-500 uppercase font-medium">Status</p>
            <div className="mt-1">
              <Badge
                variant={
                  status === 'active'
                    ? 'success'
                    : status === 'past_due'
                      ? 'danger'
                      : 'warning'
                }
                className="capitalize"
              >
                {status}
              </Badge>
            </div>
          </div>
          <div className="rounded-lg border bg-gray-50 p-4">
            <p className="text-xs text-gray-500 uppercase font-medium">Renews / ends</p>
            <p className="text-sm font-medium text-gray-900 mt-1">
              {currentPeriodEnd ? formatDate(currentPeriodEnd) : '—'}
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold text-gray-900 mb-1">Change plan</h2>
        <p className="text-sm text-gray-500 mb-6">
          Pick a tier that matches your business. Upgrading is instant; cancel anytime.
        </p>
        <PricingTable
          onSelect={handleUpgrade}
          ctaLabel={upgradeLoading ? 'Redirecting...' : 'Choose this plan'}
        />
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Team</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {memberCount} member{memberCount === 1 ? '' : 's'} · invitations coming soon
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
