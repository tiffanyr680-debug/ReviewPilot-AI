import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { destroySession, SESSION_COOKIE_NAME } from '@/lib/auth'

export async function POST() {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value

  if (sessionId) {
    try {
      await destroySession(sessionId)
    } catch (err) {
      console.error('Error destroying session on signout:', err)
    }
  }

  const response = NextResponse.json({ success: true })
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return response
}
