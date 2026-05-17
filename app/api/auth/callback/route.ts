import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  consumeMagicLinkToken,
  findOrCreateUser,
  createSession,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from '@/lib/auth'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token) {
    return NextResponse.redirect(`${origin}/auth/signin?error=auth_callback_error`)
  }

  try {
    const email = await consumeMagicLinkToken(token)
    if (!email) {
      return NextResponse.redirect(`${origin}/auth/signin?error=auth_callback_error`)
    }

    const userId = await findOrCreateUser(email)
    const sessionId = await createSession(userId)

    const response = NextResponse.redirect(`${origin}/dashboard`)
    response.cookies.set(SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    })
    return response
  } catch (err) {
    console.error('Unexpected error in GET /api/auth/callback:', err)
    return NextResponse.redirect(`${origin}/auth/signin?error=auth_callback_error`)
  }
}
