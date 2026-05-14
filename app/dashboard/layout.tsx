import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/Sidebar'
import { TopBar } from '@/components/TopBar'

async function ensureOrgForUser(userId: string, userEmail: string | undefined) {
  const admin = await createServiceClient()

  const { data: existing } = await admin
    .from('organization_members')
    .select('org_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()

  if (existing) return existing.org_id

  const orgName = userEmail ? `${userEmail.split('@')[0]}'s Business` : 'My Business'
  const { data: newOrg, error: orgErr } = await admin
    .from('organizations')
    .insert({ name: orgName, owner_id: userId })
    .select('id')
    .single()
  if (orgErr || !newOrg) throw new Error('Failed to create organization')

  await admin.from('organization_members').insert({
    org_id: newOrg.id,
    user_id: userId,
    role: 'owner',
  })

  await admin.from('subscriptions').insert({
    org_id: newOrg.id,
    status: 'trialing',
    plan: 'starter',
  })

  return newOrg.id
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/signin')

  await ensureOrgForUser(user.id, user.email)

  const { data: orgId } = await supabase.rpc('get_user_org_id')

  let plan = 'starter'
  if (orgId) {
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('plan')
      .eq('org_id', orgId)
      .maybeSingle()
    plan = sub?.plan ?? 'starter'
  }

  let alertCount = 0
  if (orgId) {
    const { count } = await supabase
      .from('reviews')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('sentiment', 'negative')
      .is('reply_content', null)
    alertCount = count ?? 0
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <TopBar user={user} plan={plan} alertCount={alertCount} />
      <main className="ml-64 pt-16 min-h-screen">
        <div className="p-6 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  )
}
