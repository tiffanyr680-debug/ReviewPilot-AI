'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { RequestTemplate } from '@/lib/supabase/types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  template?: RequestTemplate | null
  onSaved: (template: RequestTemplate) => void
}

export function RequestTemplateBuilder({ open, onOpenChange, template, onSaved }: Props) {
  const [name, setName] = useState(template?.name ?? '')
  const [smsBody, setSmsBody] = useState(template?.sms_body ?? '')
  const [emailSubject, setEmailSubject] = useState(template?.email_subject ?? '')
  const [emailBody, setEmailBody] = useState(template?.email_body ?? '')
  const [delay, setDelay] = useState(String(template?.trigger_delay_hours ?? 24))
  const [active, setActive] = useState(template?.active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name: name.trim(),
        sms_body: smsBody.trim() || null,
        email_subject: emailSubject.trim() || null,
        email_body: emailBody.trim() || null,
        trigger_delay_hours: Math.max(1, Math.min(168, parseInt(delay) || 24)),
        active,
      }

      if (template) {
        const { data, error: updateError } = await supabase
          .from('request_templates')
          .update(payload)
          .eq('id', template.id)
          .select()
          .single()
        if (updateError) throw updateError
        onSaved(data)
      } else {
        const { data: orgId } = await supabase.rpc('get_user_org_id')
        if (!orgId) throw new Error('No organization found')
        const { data, error: insertError } = await supabase
          .from('request_templates')
          .insert({ ...payload, org_id: orgId })
          .select()
          .single()
        if (insertError) throw insertError
        onSaved(data)
      }
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{template ? 'Edit template' : 'New request template'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <Label htmlFor="tname">Template name *</Label>
            <Input
              id="tname"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Post-service follow-up"
            />
          </div>

          <div>
            <Label htmlFor="sms">SMS body (max 160 chars)</Label>
            <Textarea
              id="sms"
              value={smsBody}
              onChange={(e) => setSmsBody(e.target.value)}
              maxLength={160}
              rows={3}
              placeholder="Hi {{customer_name}}! Thank you for choosing {{business_name}}. We'd love your feedback: {{review_link}}"
            />
            <p className="text-xs text-gray-500 mt-1">
              {smsBody.length}/160 · Use {'{{customer_name}}'}, {'{{business_name}}'}, {'{{review_link}}'}
            </p>
          </div>

          <div>
            <Label htmlFor="esubj">Email subject</Label>
            <Input
              id="esubj"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              placeholder="How was your experience?"
            />
          </div>

          <div>
            <Label htmlFor="ebody">Email body</Label>
            <Textarea
              id="ebody"
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Optional plain-text email body. Leave empty to use the default template."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="delay">Send delay (hours)</Label>
              <Input
                id="delay"
                type="number"
                min={1}
                max={168}
                value={delay}
                onChange={(e) => setDelay(e.target.value)}
              />
            </div>
            <div className="flex items-end gap-2">
              <Switch id="active" checked={active} onCheckedChange={setActive} />
              <Label htmlFor="active" className="cursor-pointer">
                Active
              </Label>
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || !name.trim()}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save template'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
