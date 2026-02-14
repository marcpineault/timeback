import { redirect } from 'next/navigation'
import { getOrCreateUser } from '@/lib/user'
import { getEnabledFeatures } from '@/lib/featureFlags'
import Link from 'next/link'
import { UserButton } from '@clerk/nextjs'
import ScheduleDashboard from './ScheduleDashboard'

export default async function SchedulePage() {
  const user = await getOrCreateUser()

  if (!user) {
    redirect('/sign-in')
  }

  const features = getEnabledFeatures(user.email)

  if (!features.instagramScheduling) {
    redirect('/dashboard')
  }

  return (
    <div className="landing-page min-h-screen">
      <nav className="lp-nav">
        <Link href="/" className="nav-logo">TimeBack</Link>
        <div className="nav-links">
          <Link href="/dashboard">Editor</Link>
          <Link href="/dashboard/schedule" style={{ color: '#0a0a0a', fontWeight: 600 }}>Schedule</Link>
          {features.ideate && (
            <Link href="/dashboard/ideate">Ideate</Link>
          )}
          <Link href="/account/subscription">Subscription</Link>
          <UserButton afterSignOutUrl="/" />
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-8" style={{ paddingTop: '5rem' }}>
        <ScheduleDashboard />
      </div>
    </div>
  )
}
