import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession, getCurrentOrgId } from '@/lib/auth'
import { execute } from '@/lib/db'

const UpdateOrgSchema = z.object({
  name: z.string().min(1).max(100),
  brand_voice: z.string().min(10).max(500),
})

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = await getCurrentOrgId(session.userId)
    if (!orgId) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = UpdateOrgSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 422 },
      )
    }

    await execute('UPDATE organizations SET name = ?, brand_voice = ? WHERE id = ?', [
      parsed.data.name,
      parsed.data.brand_voice,
      orgId,
    ])

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error in PATCH /api/org:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
