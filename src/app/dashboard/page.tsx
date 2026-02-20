import { redirect } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { getOrCreateUser, getUserUsage } from '@/lib/user'
import { PLANS } from '@/lib/plans'
import { getEnabledFeatures } from '@/lib/featureFlags'
import VideoProcessor from './VideoProcessor'
import WelcomeOverlay from '@/components/WelcomeOverlay'
import RecentVideosTable from '@/components/RecentVideosTable'
import OnboardingBanner from '@/components/OnboardingBanner'
import Link from 'next/link'
import MobileMenuToggle from '@/components/MobileMenuToggle'

export default async function DashboardPage() {
  let user
  let usage

  try {
    user = await getOrCreateUser()

    if (!user) {
      redirect('/sign-in')
    }

    usage = await getUserUsage(user.id)

    if (!usage) {
      redirect('/sign-in')
    }
  } catch (error) {
    console.error('Dashboard error:', error)
    return (
      <div className="landing-page min-h-screen flex items-center justify-center">
        <div className="bg-white border border-[#e0dbd4] rounded-2xl p-8 max-w-md text-center">
          <h1 className="text-xl font-semibold text-[#0a0a0a] mb-2">Something went wrong</h1>
          <p className="text-[#8a8580] mb-4">
            There was an issue loading your dashboard. Please try signing out and back in.
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

  const usagePercentage = usage.planDetails.videosPerMonth
    ? (usage.videosUsed / usage.planDetails.videosPerMonth) * 100
    : 0

  const isNewUser = !usage.hasCompletedOnboarding && usage.recentVideos.length === 0
  const features = getEnabledFeatures(user.email)

  // Format today's date
  const today = new Date()
  const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  // Greeting based on time of day
  const hour = today.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const displayName = usage.userName?.split(' ')[0] || ''

  // Serialize videos for client component
  const serializedVideos = usage.recentVideos.map(v => ({
    id: v.id,
    originalName: v.originalName,
    status: v.status,
    createdAt: v.createdAt.toISOString(),
    processedUrl: v.processedUrl,
  }))

  return (
    <div className="landing-page min-h-screen">
      <WelcomeOverlay isNewUser={isNewUser} />
      {/* Header */}
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
          <Link href="/dashboard" style={{ color: '#0a0a0a', fontWeight: 600 }} className="nav-tab-link">
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
          <UserButton afterSignOutUrl="/" />
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-8" style={{ paddingTop: '5rem' }}>
        {/* Onboarding Banner for new users */}
        {usage.videosUsed < 5 && (
          <OnboardingBanner activeStep="editor" />
        )}

        {/* Welcome Header */}
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-[#0a0a0a]" style={{ fontFamily: "'Instrument Serif', serif" }}>
            {greeting}{displayName ? `, ${displayName}` : ''}
          </h1>
          <p className="text-[#8a8580] text-sm mt-0.5">{dateStr}</p>
        </div>

        {/* Usage Card */}
        <div className="bg-white border border-[#e0dbd4] rounded-2xl p-4 sm:p-6 mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-[#0a0a0a]" style={{ fontFamily: "'Instrument Serif', serif" }}>
                {PLANS[usage.plan as keyof typeof PLANS].name} Plan
              </h2>
              <p className="text-[#8a8580] text-sm">
                {usage.planDetails.videosPerMonth
                  ? `${usage.videosUsed} of ${usage.planDetails.videosPerMonth} videos used this month`
                  : `${usage.videosUsed} videos used this month (unlimited)`}
              </p>
            </div>
            {usage.plan === 'FREE' ? (
              <Link
                href="/pricing"
                className="px-4 py-2 bg-[#e85d26] hover:bg-[#d14d1a] text-white rounded-full text-sm font-medium transition-colors text-center"
              >
                Upgrade to Pro
              </Link>
            ) : (
              <Link
                href="/account/subscription"
                className="px-4 py-2 bg-[#f5f0e8] hover:bg-[#e0dbd4] text-[#0a0a0a] rounded-full text-sm font-medium transition-colors text-center"
              >
                Manage Plan
              </Link>
            )}
          </div>
          <div className="w-full bg-[#e0dbd4] rounded-full h-2">
            <div
              className="bg-[#e85d26] h-2 rounded-full transition-all"
              style={{ width: `${Math.min(usagePercentage, 100)}%` }}
            />
          </div>
          {usage.videosRemaining !== null && usage.videosRemaining <= 0 && (
            <p className="text-amber-600 text-sm mt-2">
              You&apos;ve reached your monthly limit. Upgrade to process more videos.
            </p>
          )}
        </div>

        {/* Quick Stats Cards */}
        <div className="flex gap-3 mb-6 sm:mb-8">
          <div className="stat-card">
            <div className="stat-card-value">
              {usage.planDetails.videosPerMonth
                ? `${usage.videosUsed}/${usage.planDetails.videosPerMonth}`
                : usage.videosUsed}
            </div>
            <div className="stat-card-label">Videos this month</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-value">{usage.scheduledCount}</div>
            <div className="stat-card-label">Scheduled</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-value">{usage.processingCount}</div>
            <div className="stat-card-label">Processing</div>
          </div>
        </div>

        {/* Video Processor */}
        <VideoProcessor
          userId={user.id}
          canProcess={usage.videosRemaining === null || usage.videosRemaining > 0}
          videosRemaining={usage.videosRemaining ?? Infinity}
          hasWatermark={usage.planDetails.watermark}
          enabledFeatures={features}
          videosProcessed={usage.videosUsed}
        />

        {/* Recent Videos */}
        {serializedVideos.length > 0 && (
          <RecentVideosTable videos={serializedVideos} />
        )}
      </div>
    </div>
  )
}
