'use client'

import { useState } from 'react'
import { Plus, MapPin, Star, Trash2, Loader2, RefreshCw } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import { getTierLimits } from '@/lib/utils'
import type { Location } from '@/lib/supabase/types'

interface Props {
  initialLocations: Location[]
  plan: 'starter' | 'pro' | 'agency'
}

export function LocationsClient({ initialLocations, plan }: Props) {
  const [locations, setLocations] = useState(initialLocations)
  const [open, setOpen] = useState(false)
  const [syncing, setSyncing] = useState<string | null>(null)
  const supabase = createClient()
  const limits = getTierLimits(plan)
  const atLimit = locations.length >= limits.locations

  async function handleDelete(id: string) {
    if (!confirm('Delete this location? Reviews and request history will also be removed.')) return
    const { error } = await supabase.from('locations').delete().eq('id', id)
    if (error) {
      alert('Failed to delete: ' + error.message)
      return
    }
    setLocations((prev) => prev.filter((l) => l.id !== id))
  }

  async function handleSync(id: string) {
    setSyncing(id)
    try {
      const res = await fetch('/api/reviews/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location_id: id }),
      })
      const data = (await res.json()) as { synced?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Sync failed')
      alert(`Synced ${data.synced ?? 0} new review(s).`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Locations</h1>
          <p className="text-sm text-gray-500 mt-1">
            {locations.length} of {limits.locations} ({plan} plan)
          </p>
        </div>
        <Button
          onClick={() => setOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
          disabled={atLimit}
        >
          <Plus className="w-4 h-4" />
          Add location
        </Button>
      </div>

      {atLimit && (
        <Card className="p-4 border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-800">
            You&apos;ve reached the location limit for your {plan} plan.{' '}
            <a href="/dashboard/settings" className="font-medium underline">
              Upgrade
            </a>{' '}
            to add more.
          </p>
        </Card>
      )}

      {locations.length === 0 ? (
        <Card className="p-12 text-center">
          <MapPin className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-900">No locations yet</p>
          <p className="text-xs text-gray-500 mt-1 mb-4">
            Add your first location to start collecting reviews.
          </p>
          <Button onClick={() => setOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
            Add your first location
          </Button>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {locations.map((loc) => (
            <Card key={loc.id} className="p-5">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-gray-900 truncate">{loc.name}</h3>
                  {loc.address && (
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{loc.address}</p>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(loc.id)}
                  className="text-gray-400 hover:text-red-500 p-1"
                  aria-label="Delete location"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-sm">
                  <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                  <span className="font-medium text-gray-900">
                    {(loc.rating_avg ?? 0).toFixed(1)}
                  </span>
                  <span className="text-gray-500 text-xs">({loc.review_count})</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSync(loc.id)}
                  disabled={syncing === loc.id}
                  className="gap-1"
                >
                  {syncing === loc.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  Sync
                </Button>
              </div>
              <div className="mt-3 flex gap-1.5 flex-wrap">
                {loc.google_place_id && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-medium">
                    Google
                  </span>
                )}
                {loc.facebook_page_id && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium">
                    Facebook
                  </span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <NewLocationDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={(loc) => setLocations((prev) => [loc, ...prev])}
      />
    </div>
  )
}

function NewLocationDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (loc: Location) => void
}) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [googlePlaceId, setGooglePlaceId] = useState('')
  const [facebookPageId, setFacebookPageId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/businesses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          address: address || undefined,
          google_place_id: googlePlaceId || undefined,
          facebook_page_id: facebookPageId || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create location')
      onCreated(data as Location)
      setName('')
      setAddress('')
      setGooglePlaceId('')
      setFacebookPageId('')
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create location')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a location</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label htmlFor="name">Business name *</Label>
            <Input
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Plumbing — Downtown"
            />
          </div>
          <div>
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main St, Springfield"
            />
          </div>
          <div>
            <Label htmlFor="google">Google Place ID</Label>
            <Input
              id="google"
              value={googlePlaceId}
              onChange={(e) => setGooglePlaceId(e.target.value)}
              placeholder="ChIJ..."
            />
            <p className="text-xs text-gray-500 mt-1">
              Find at developers.google.com/maps/documentation/places/web-service/place-id
            </p>
          </div>
          <div>
            <Label htmlFor="facebook">Facebook Page ID</Label>
            <Input
              id="facebook"
              value={facebookPageId}
              onChange={(e) => setFacebookPageId(e.target.value)}
              placeholder="123456789"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !name} className="bg-emerald-600 hover:bg-emerald-700">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add location'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
