'use client'

import { useState } from 'react'
import { Plus, Edit, Trash2, Send, Loader2, FileText } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { RequestTemplateBuilder } from '@/components/RequestTemplateBuilder'
import { formatRelativeTime, getTierLimits } from '@/lib/utils'
import type { RequestTemplate, ReviewRequest, Location } from '@/lib/db-types'

interface Props {
  initialTemplates: RequestTemplate[]
  recentRequests: ReviewRequest[]
  locations: Pick<Location, 'id' | 'name'>[]
  plan: 'starter' | 'pro' | 'agency'
}

export function RequestsClient({ initialTemplates, recentRequests, locations, plan }: Props) {
  const [templates, setTemplates] = useState(initialTemplates)
  const [requests, setRequests] = useState(recentRequests)
  const [builderOpen, setBuilderOpen] = useState(false)
  const [editing, setEditing] = useState<RequestTemplate | null>(null)
  const [sendOpen, setSendOpen] = useState(false)
  const limits = getTierLimits(plan)

  async function handleDelete(id: string) {
    if (!confirm('Delete this template?')) return
    const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert('Failed: ' + (data.error ?? 'Unknown error'))
      return
    }
    setTemplates((prev) => prev.filter((t) => t.id !== id))
  }

  function handleSaved(saved: RequestTemplate) {
    setTemplates((prev) => {
      const idx = prev.findIndex((t) => t.id === saved.id)
      if (idx === -1) return [saved, ...prev]
      const copy = [...prev]
      copy[idx] = saved
      return copy
    })
    setEditing(null)
  }

  function openNew() {
    setEditing(null)
    setBuilderOpen(true)
  }

  function openEdit(t: RequestTemplate) {
    setEditing(t)
    setBuilderOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Review Requests</h1>
          <p className="text-sm text-gray-500 mt-1">
            Send SMS or email invites and manage your templates.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={openNew} variant="outline" className="gap-1.5">
            <Plus className="w-4 h-4" />
            New template
          </Button>
          <Button
            onClick={() => setSendOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
            disabled={templates.length === 0 || locations.length === 0}
          >
            <Send className="w-4 h-4" />
            Send request
          </Button>
        </div>
      </div>

      <Tabs defaultValue="templates">
        <TabsList>
          <TabsTrigger value="templates">Templates ({templates.length})</TabsTrigger>
          <TabsTrigger value="history">History ({requests.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="mt-4">
          {templates.length === 0 ? (
            <Card className="p-12 text-center">
              <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-900">No templates yet</p>
              <p className="text-xs text-gray-500 mt-1 mb-4">
                Create your first template to start sending review requests.
              </p>
              <Button onClick={openNew} className="bg-emerald-600 hover:bg-emerald-700">
                Create template
              </Button>
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {templates.map((t) => (
                <Card key={t.id} className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900 truncate">{t.name}</h3>
                        <Badge variant={t.active ? 'success' : 'secondary'}>
                          {t.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Send after {t.trigger_delay_hours}h · {t.sms_body ? 'SMS' : ''}{' '}
                        {t.sms_body && t.email_body ? '+' : ''} {t.email_body ? 'Email' : ''}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEdit(t)}
                        className="text-gray-400 hover:text-gray-700 p-1"
                        aria-label="Edit"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(t.id)}
                        className="text-gray-400 hover:text-red-500 p-1"
                        aria-label="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {t.sms_body && (
                    <p className="mt-3 text-xs text-gray-600 line-clamp-2 bg-gray-50 rounded p-2">
                      {t.sms_body}
                    </p>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          {requests.length === 0 ? (
            <Card className="p-12 text-center text-sm text-gray-500">
              No requests sent yet.
            </Card>
          ) : (
            <Card>
              <ul className="divide-y divide-gray-100">
                {requests.map((r) => (
                  <li key={r.id} className="p-4 flex items-center gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {r.customer_name ?? 'Anonymous'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {r.customer_phone ?? r.customer_email ?? '—'}
                      </p>
                    </div>
                    <Badge variant={statusVariant(r.status)} className="capitalize">
                      {r.status}
                    </Badge>
                    <span className="text-xs text-gray-500 w-20 text-right">
                      {formatRelativeTime(r.sent_at ?? r.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <RequestTemplateBuilder
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        template={editing}
        onSaved={handleSaved}
      />

      <SendRequestDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        templates={templates.filter((t) => t.active)}
        locations={locations}
        smsAllowed={limits.sms}
        onSent={(req) => setRequests((prev) => [req, ...prev])}
      />
    </div>
  )
}

function statusVariant(status: string): 'success' | 'warning' | 'danger' | 'secondary' {
  if (status === 'completed' || status === 'opened' || status === 'clicked') return 'success'
  if (status === 'failed') return 'danger'
  if (status === 'pending') return 'warning'
  return 'secondary'
}

function SendRequestDialog({
  open,
  onOpenChange,
  templates,
  locations,
  smsAllowed,
  onSent,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  templates: RequestTemplate[]
  locations: Pick<Location, 'id' | 'name'>[]
  smsAllowed: boolean
  onSent: (req: ReviewRequest) => void
}) {
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '')
  const [locationId, setLocationId] = useState(locations[0]?.id ?? '')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!customerName || !templateId || !locationId) return
    if (!customerEmail && !customerPhone) {
      setError('Provide an email or phone number.')
      return
    }
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/requests/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: customerName,
          customer_email: customerEmail || undefined,
          customer_phone: customerPhone || undefined,
          template_id: templateId,
          location_id: locationId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to send')
      onSent({
        id: data.request_id,
        org_id: '',
        location_id: locationId,
        customer_name: customerName,
        customer_phone: customerPhone || null,
        customer_email: customerEmail || null,
        template_id: templateId,
        status: 'sent',
        sent_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      })
      setCustomerName('')
      setCustomerEmail('')
      setCustomerPhone('')
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send a review request</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSend} className="space-y-3">
          <div>
            <Label htmlFor="cname">Customer name *</Label>
            <Input
              id="cname"
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="cemail">Customer email</Label>
            <Input
              id="cemail"
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="customer@example.com"
            />
          </div>
          <div>
            <Label htmlFor="cphone">
              Customer phone {!smsAllowed && '(Pro plan required)'}
            </Label>
            <Input
              id="cphone"
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="+15551234567"
              disabled={!smsAllowed}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Location</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Template</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={sending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send request'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
