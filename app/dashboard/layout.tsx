import { redirect } from 'next/navigation'
import { getSession, getCurrentOrgId, newId } from '@/lib/auth'
import { queryOne, execute, count } from '@/lib/db'
import { Sidebar } from '@/components/Sidebar'
import { TopBar } from '@/components/TopBar'

async function ensureOrgForUser(userId: string, userEmail: string): Promise<string> {
  const existing = await getCurrentOrgId(userId)
  if (existing) return existing

  const orgName = userEmail ? `${userEmail.split('@')[0]}'s Business` : 'My Business'
  const orgId = newId()

  await execute('INSERT INTO organizations (id, name, owner_id) VALUES (?, ?, ?)', [
    orgId,
    orgName,
    userId,
  ])
  await execute(
    "INSERT INTO organization_members (id, org_id, user_id, role) VALUES (?, ?, ?, 'owner')",
    [newId(), orgId, userId],
  )
  await execute(
    "INSERT INTO subscriptions (id, org_id, status, plan) VALUES (?, ?, 'trialing', 'starter')",
    [newId(), orgId],
  )

  return orgId
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/auth/signin')

  const orgId = await ensureOrgForUser(session.userId, session.email)

  const sub = await queryOne<{ plan: string }>(
    'SELECT plan FROM subscriptions WHERE org_id = ?',
    [orgId],
  )
  const plan = sub?.plan ?? 'starter'

  const alertCount = await count(
    "SELECT COUNT(*) AS c FROM reviews WHERE org_id = ? AND sentiment = 'negative' AND reply_content IS NULL",
    [orgId],
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <TopBar user={{ email: session.email }} plan={plan} alertCount={alertCount} />
      <main className="ml-64 pt-16 min-h-screen">
        <div className="p-6 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  )
}
