import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { findOrCreateUser, createMagicLinkToken } from '@/lib/auth'
import { sendMagicLinkEmail } from '@/lib/email'

const SignInSchema = z.object({ email: z.string().email() })

export async function POST(request: NextRequest) {
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = SignInSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'A valid email address is required' }, { status: 422 })
    }

    const email = parsed.data.email.toLowerCase()
    await findOrCreateUser(email)
    const token = await createMagicLinkToken(email)
    const signInLink = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback?token=${token}`
    await sendMagicLinkEmail(email, signInLink)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error in POST /api/auth/signin:', err)
    return NextResponse.json({ error: 'Failed to send sign-in link' }, { status: 500 })
  }
}
