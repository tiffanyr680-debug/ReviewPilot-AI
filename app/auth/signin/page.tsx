'use client'

import { useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Mail, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

function SignInForm() {
  const searchParams = useSearchParams()
  const urlError = searchParams.get('error')

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(
    urlError === 'auth_callback_error' ? 'Sign-in link was invalid or expired. Try again.' : null
  )

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to send sign-in link')
      }
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send sign-in link')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md p-8">
      <div className="text-center mb-6">
        <Link href="/" className="inline-flex items-center gap-2 mb-4">
          <div className="w-9 h-9 rounded-lg bg-emerald-500 flex items-center justify-center">
            <span className="text-white font-bold">R</span>
          </div>
          <span className="font-semibold text-[#0F172A]">ReviewPilot AI</span>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Sign in to your account</h1>
        <p className="mt-1.5 text-sm text-gray-600">
          We&apos;ll email you a one-time sign-in link.
        </p>
      </div>

      {sent ? (
        <div className="text-center py-6">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          <h2 className="font-semibold text-gray-900 mb-1">Check your email</h2>
          <p className="text-sm text-gray-600">
            We sent a sign-in link to <strong>{email}</strong>. Click it to continue.
          </p>
          <button
            onClick={() => {
              setSent(false)
              setEmail('')
            }}
            className="mt-4 text-sm text-emerald-600 hover:underline"
          >
            Use a different email
          </button>
        </div>
      ) : (
        <form onSubmit={handleSignIn} className="space-y-4">
          <div>
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@business.com"
              className="mt-1.5"
              disabled={loading}
              autoFocus
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <Button
            type="submit"
            disabled={loading || !email}
            className="w-full bg-emerald-600 hover:bg-emerald-700 gap-2"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Mail className="w-4 h-4" />
            )}
            {loading ? 'Sending link...' : 'Send sign-in link'}
          </Button>
        </form>
      )}

      <p className="text-center text-xs text-gray-500 mt-6">
        By signing in, you agree to our Terms and Privacy Policy.
      </p>
    </Card>
  )
}

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <Suspense fallback={<div className="text-sm text-gray-500">Loading...</div>}>
        <SignInForm />
      </Suspense>
    </div>
  )
}
