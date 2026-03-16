import { redirect } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { getOrCreateUser, getUserUsage } from '@/lib/user'
import { PLANS } from '@/lib/plans'
import { getEnabledFeatures } from '@/lib/featureFlags'
import VideoProcessor from '../VideoProcessor'
import WelcomeOverlay from '@/components/WelcomeOverlay'
import OnboardingBanner from '@/components/OnboardingBanner'
import Link from 'next/link'
import MobileMenuToggle from '@/components/MobileMenuToggle'
import UpgradeBanner from '@/components/upgrade/UpgradeBanner'
import UsageWarningBanner from '@/components/upgrade/UsageWarningBanner'

export default async function EditorPage() {
  let user
  let usage

  try {
    user = await getOrCreateUser()
    if (user) {
      usage = await getUserUsage(user.id)
    }
  } catch (error) {
    console.error('Editor error:', error)
    return (
      <div className="landing-page min-h-screen flex items-center justify-center">
        <div className="bg-white border border-[#e0dbd4] rounded-2xl p-8 max-w-md text-center">
          <h1 className="text-xl font-semibold text-[#0a0a0a] mb-2">Something went wrong</h1>
          <p className="text-[#8a8580] mb-4">
            There was an issue loading the editor. Please try signing out and back in.
          </p>
          <Link
            href="/sign-in"
            className="inline-block px-4 py-2 bg-[#e85d26] hover:bg-[#d14d1a] text-white rounded-full font-medium transition-colors"
          >
            Sign In Again
          </Link>
        </div>
      </div>
    )
  }

  if (!user) {
    redirect('/sign-in')
  }

  if (!usage) {
    redirect('/sign-in')
  }

  const features = getEnabledFeatures(user.email)

  return (
    <div className="landing-page min-h-screen">
      <WelcomeOverlay isNewUser={!usage.hasCompletedOnboarding && usage.recentVideos.length === 0} />
      {/* Header */}
      <nav className="lp-nav">
        <Link href="/" className="nav-logo">TimeBack</Link>
        <MobileMenuToggle />
        <div className="nav-links">
          <Link href="/dashboard" className="nav-tab-link">
            <span>Dashboard</span>
            <span className="nav-tab-subtitle">Overview</span>
          </Link>
          <Link href="/dashboard/editor" style={{ color: '#0a0a0a', fontWeight: 600 }} className="nav-tab-link">
            <span>Editor</span>
            <span className="nav-tab-subtitle">Upload &amp; Edit</span>
          </Link>
          {features.instagramScheduling && (
            <Link href="/dashboard/schedule" className="nav-tab-link">
              <span>Schedule</span>
              <span className="nav-tab-subtitle">Post to IG</span>
            </Link>
          )}
          <a
            href="https://www.youtube.com/playlist?list=PLhATaQNX0bxMeX0e8AA-TSk8L0g3t-QX7"
            target="_blank"
            rel="noopener noreferrer"
          >
            Tutorials
          </a>
          <Link href="/account/subscription">Subscription</Link>
          {usage.plan === 'FREE' && (
            <Link
              href="/pricing?source=nav_pill"
              className="px-3 py-1 bg-[rgba(232,93,38,0.1)] text-[#e85d26] text-xs font-semibold rounded-full border border-[#e85d26]/30 hover:bg-[rgba(232,93,38,0.2)] transition-colors"
            >
              Upgrade
            </Link>
          )}
          <UserButton afterSignOutUrl="/" />
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-8" style={{ paddingTop: '5rem' }}>
        {/* Onboarding Banner for new users */}
        {usage.videosUsed < 5 && (
          <OnboardingBanner activeStep="editor" />
        )}

        {/* Usage Warning Banner */}
        {usage.plan === 'FREE' && usage.videosRemaining !== null && usage.planDetails.videosPerMonth && (usage.videosUsed / usage.planDetails.videosPerMonth) * 100 >= 80 && (usage.videosUsed / usage.planDetails.videosPerMonth) * 100 < 100 && (
          <UsageWarningBanner
            remaining={usage.videosRemaining}
            resource="videos"
            used={usage.videosUsed}
            limit={usage.planDetails.videosPerMonth}
            plan={usage.plan}
          />
        )}

        {/* Upgrade Banner */}
        {usage.plan === 'FREE' && usage.planDetails.videosPerMonth && (usage.videosUsed / usage.planDetails.videosPerMonth) * 100 >= 80 && (
          <UpgradeBanner
            context="usage_warning"
            plan={usage.plan}
            videosUsed={usage.videosUsed}
            videosLimit={usage.planDetails.videosPerMonth}
            location="dashboard"
          />
        )}

        {/* Video Processor */}
        <VideoProcessor
          userId={user.id}
          canProcess={usage.videosRemaining === null || usage.videosRemaining > 0}
          videosRemaining={usage.videosRemaining ?? Infinity}
          hasWatermark={usage.planDetails.watermark}
          enabledFeatures={features}
          videosProcessed={usage.videosUsed}
        />
      </div>
    </div>
  )
}
