import { redirect } from 'next/navigation'
import { getOrCreateUser, getUserUsage } from '@/lib/user'
import { getEnabledFeatures } from '@/lib/featureFlags'
import Link from 'next/link'
import { UserButton } from '@clerk/nextjs'
import IdeateDashboard from './IdeateDashboard'

export default async function IdeatePage() {
  const user = await getOrCreateUser()

  if (!user) {
    redirect('/sign-in')
  }

  const features = getEnabledFeatures(user.email)

  if (!features.ideate) {
    redirect('/dashboard')
  }

  const usage = await getUserUsage(user.id)

  return (
    <div className="landing-page min-h-screen">
      {/* Header */}
      <nav className="lp-nav">
        <Link href="/" className="nav-logo">TimeBack</Link>
        <div className="nav-links">
          <Link href="/dashboard">Editor</Link>
          {features.instagramScheduling && (
            <Link href="/dashboard/schedule">Schedule</Link>
          )}
          <Link href="/dashboard/ideate" style={{ color: '#0a0a0a', fontWeight: 600 }}>Ideate</Link>
          <Link href="/account/subscription">Subscription</Link>
          <UserButton afterSignOutUrl="/" />
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-8" style={{ paddingTop: '5rem' }}>
        <IdeateDashboard
          ideateUsed={usage?.ideateUsed ?? 0}
          ideateLimit={usage?.planDetails.ideateGenerationsPerMonth ?? null}
          plan={usage?.plan ?? 'FREE'}
        />
      </div>
    </div>
  )
}
