'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Sparkles, Loader2, Send } from 'lucide-react'
import type { Review } from '@/lib/db-types'

interface Draft {
  tone: 'professional' | 'friendly' | 'formal'
  text: string
}

interface AIReplyButtonProps {
  review: Review
  brandVoice: string
  onReplySubmitted?: (reviewId: string, reply: string) => void
}

export function AIReplyButton({ review, brandVoice, onReplySubmitted }: AIReplyButtonProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [selected, setSelected] = useState(0)
  const [editedText, setEditedText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleOpen() {
    setOpen(true)
    if (drafts.length > 0) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/draft-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          review_id: review.id,
          review_text: review.content ?? '',
          rating: review.rating ?? 3,
          source: review.source,
          brand_voice: brandVoice,
        }),
      })
      if (!res.ok) throw new Error('Failed to generate drafts')
      const data = (await res.json()) as { drafts: Draft[] }
      setDrafts(data.drafts)
      setEditedText(data.drafts[0]?.text ?? '')
    } catch {
      setError('Could not generate drafts. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function selectDraft(index: number) {
    setSelected(index)
    setEditedText(drafts[index]?.text ?? '')
  }

  async function handleSubmit() {
    if (!editedText.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/reviews/${review.id}/reply`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply_content: editedText.trim() }),
      })
      if (!res.ok) throw new Error('Failed to save reply')
      onReplySubmitted?.(review.id, editedText.trim())
      setOpen(false)
    } catch {
      setError('Failed to save reply. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const toneColors: Record<string, string> = {
    professional: 'bg-blue-100 text-blue-800',
    friendly: 'bg-emerald-100 text-emerald-800',
    formal: 'bg-purple-100 text-purple-800',
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={handleOpen} className="gap-1.5">
        <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
        AI Reply
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-500" />
              AI Reply Drafts
            </DialogTitle>
          </DialogHeader>

          {loading && (
            <div className="flex items-center justify-center py-12 gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
              <span className="text-sm text-muted-foreground">Generating 3 reply drafts…</span>
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-md p-3">{error}</div>
          )}

          {!loading && drafts.length > 0 && (
            <div className="space-y-4">
              <div className="flex gap-2">
                {drafts.map((draft, i) => (
                  <button
                    key={draft.tone}
                    onClick={() => selectDraft(i)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      selected === i
                        ? toneColors[draft.tone] + ' ring-2 ring-offset-1 ring-current'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {draft.tone.charAt(0).toUpperCase() + draft.tone.slice(1)}
                  </button>
                ))}
              </div>

              <div className="bg-gray-50 rounded-md p-3 text-sm text-gray-700">
                <p className="font-medium text-xs text-muted-foreground mb-1">Preview:</p>
                {drafts[selected]?.text}
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-2">Edit before sending:</p>
                <Textarea
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  rows={4}
                  className="resize-none"
                  maxLength={1000}
                />
                <p className="text-xs text-muted-foreground mt-1 text-right">
                  {editedText.length} / 1000
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || !editedText.trim()}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {submitting ? 'Saving…' : 'Save Reply'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
