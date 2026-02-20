import { redirect } from 'next/navigation'
import { getOrCreateUser, getUserUsage } from '@/lib/user'
import { getEnabledFeatures } from '@/lib/featureFlags'
import Link from 'next/link'
import { UserButton } from '@clerk/nextjs'
import ScheduleDashboard from './ScheduleDashboard'
import OnboardingBanner from '@/components/OnboardingBanner'
import MobileMenuToggle from '@/components/MobileMenuToggle'

export default async function SchedulePage() {
  const user = await getOrCreateUser()

  if (!user) {
    redirect('/sign-in')
  }

  const features = getEnabledFeatures(user.email)

  if (!features.instagramScheduling) {
    redirect('/dashboard')
  }

  const usage = await getUserUsage(user.id)

  return (
    <div className="landing-page min-h-screen">
      <nav className="lp-nav">
        <Link href="/" className="nav-logo">TimeBack</Link>
        <MobileMenuToggle />
        <div className="nav-links">
          {features.ideate && (
            <Link href="/dashboard/ideate" className="nav-tab-link">
              <span>Ideate</span>
              <span className="nav-tab-subtitle">Scripts</span>
            </Link>
          )}
          <Link href="/dashboard" className="nav-tab-link">
            <span>Editor</span>
            <span className="nav-tab-subtitle">Upload &amp; Edit</span>
          </Link>
          <Link href="/dashboard/schedule" style={{ color: '#0a0a0a', fontWeight: 600 }} className="nav-tab-link">
            <span>Schedule</span>
            <span className="nav-tab-subtitle">Post to IG</span>
          </Link>
          <a
            href="https://www.youtube.com/playlist?list=PLhATaQNX0bxMeX0e8AA-TSk8L0g3t-QX7"
            target="_blank"
            rel="noopener noreferrer"
          >
            Tutorials
          </a>
          <Link href="/account/subscription">Subscription</Link>
          <UserButton afterSignOutUrl="/" />
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-8" style={{ paddingTop: '5rem' }}>
        {/* Onboarding Banner for new users */}
        {(usage?.videosUsed ?? 0) < 5 && (
          <OnboardingBanner activeStep="schedule" />
        )}

        <ScheduleDashboard />
      </div>
    </div>
  )
}
