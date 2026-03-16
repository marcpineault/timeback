import { redirect } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { getOrCreateUser, getUserUsage } from '@/lib/user'
import { PLANS } from '@/lib/plans'
import { getEnabledFeatures } from '@/lib/featureFlags'
import WelcomeOverlay from '@/components/WelcomeOverlay'
import OnboardingBanner from '@/components/OnboardingBanner'
import Link from 'next/link'
import MobileMenuToggle from '@/components/MobileMenuToggle'
import UpgradeBanner from '@/components/upgrade/UpgradeBanner'
import UsageWarningBanner from '@/components/upgrade/UsageWarningBanner'
import RecentVideos from '@/components/RecentVideos'

export default async function DashboardPage() {
  let user
  let usage

  try {
    user = await getOrCreateUser()
    if (user) {
      usage = await getUserUsage(user.id)
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

  // Redirects MUST be outside try-catch — redirect() works by throwing
  // a special error, and catching it prevents the redirect from happening.
  if (!user) {
    redirect('/sign-in')
  }

  if (!usage) {
    redirect('/sign-in')
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

  // Analytics: compute time saved from silence removal
  const totalSilenceRemoved = usage.recentVideos.reduce((sum, v) => sum + (v.silenceRemoved || 0), 0)
  const totalDuration = usage.recentVideos.reduce((sum, v) => sum + (v.duration || 0), 0)
  const completedVideos = usage.recentVideos.filter(v => v.status === 'COMPLETED')

  return (
    <div className="landing-page min-h-screen">
      <WelcomeOverlay isNewUser={isNewUser} />
      {/* Header */}
      <nav className="lp-nav">
        <Link href="/" className="nav-logo">TimeBack</Link>
        <MobileMenuToggle />
        <div className="nav-links">
          <Link href="/dashboard" style={{ color: '#0a0a0a', fontWeight: 600 }} className="nav-tab-link">
            <span>Dashboard</span>
            <span className="nav-tab-subtitle">Overview</span>
          </Link>
          <Link href="/dashboard/editor" className="nav-tab-link">
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
              className={`h-2 rounded-full transition-all ${
                usagePercentage >= 100 ? 'bg-red-500' :
                usagePercentage >= 80 ? 'bg-amber-500' :
                usagePercentage >= 60 ? 'bg-[#e85d26]' :
                'bg-green-500'
              }`}
              style={{ width: `${Math.min(usagePercentage, 100)}%` }}
            />
          </div>
          {usage.videosRemaining !== null && (
            <p className={`text-sm mt-2 ${
              usage.videosRemaining <= 0 ? 'text-red-500 font-semibold' :
              usage.videosRemaining <= 1 ? 'text-red-500' :
              usage.videosRemaining <= 2 ? 'text-amber-500' :
              'text-[#8a8580]'
            }`}>
              {usage.videosRemaining <= 0
                ? "You've reached your monthly limit. Upgrade to process more videos."
                : `${usage.videosRemaining} video${usage.videosRemaining !== 1 ? 's' : ''} remaining this month`}
            </p>
          )}
        </div>

        {/* Usage Warning Banner — shows at 80%+ usage for FREE users */}
        {usage.plan === 'FREE' && usage.videosRemaining !== null && usage.planDetails.videosPerMonth && usagePercentage >= 80 && usagePercentage < 100 && (
          <UsageWarningBanner
            remaining={usage.videosRemaining}
            resource="videos"
            used={usage.videosUsed}
            limit={usage.planDetails.videosPerMonth}
            plan={usage.plan}
          />
        )}

        {/* Upgrade Banner — shows at 80%+ for contextual upgrade prompt */}
        {usage.plan === 'FREE' && usagePercentage >= 80 && (
          <UpgradeBanner
            context="usage_warning"
            plan={usage.plan}
            videosUsed={usage.videosUsed}
            videosLimit={usage.planDetails.videosPerMonth}
            location="dashboard"
          />
        )}

        {/* Quick Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 sm:mb-8">
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
          <div className="stat-card">
            <div className="stat-card-value">{completedVideos.length}</div>
            <div className="stat-card-label">Completed</div>
          </div>
        </div>

        {/* Time Saved Analytics */}
        {completedVideos.length > 0 && (
          <div className="bg-white border border-[#e0dbd4] rounded-2xl p-4 sm:p-6 mb-6">
            <h2 className="text-base sm:text-lg font-semibold text-[#0a0a0a] mb-4" style={{ fontFamily: "'Instrument Serif', serif" }}>
              Time Saved
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-[#f5f0e8] rounded-xl">
                <div className="text-2xl sm:text-3xl font-bold text-[#e85d26]">
                  {totalSilenceRemoved >= 60
                    ? `${Math.floor(totalSilenceRemoved / 60)}m ${totalSilenceRemoved % 60}s`
                    : `${totalSilenceRemoved}s`}
                </div>
                <div className="text-xs text-[#8a8580] mt-1">Silence removed</div>
              </div>
              <div className="text-center p-4 bg-[#f5f0e8] rounded-xl">
                <div className="text-2xl sm:text-3xl font-bold text-[#0a0a0a]">
                  {totalDuration >= 3600
                    ? `${Math.floor(totalDuration / 3600)}h ${Math.floor((totalDuration % 3600) / 60)}m`
                    : totalDuration >= 60
                    ? `${Math.floor(totalDuration / 60)}m ${totalDuration % 60}s`
                    : `${totalDuration}s`}
                </div>
                <div className="text-xs text-[#8a8580] mt-1">Total video duration</div>
              </div>
              <div className="text-center p-4 bg-[#f5f0e8] rounded-xl">
                <div className="text-2xl sm:text-3xl font-bold text-[#0a0a0a]">
                  {totalDuration > 0
                    ? `${Math.round((totalSilenceRemoved / totalDuration) * 100)}%`
                    : '0%'}
                </div>
                <div className="text-xs text-[#8a8580] mt-1">Avg. silence ratio</div>
              </div>
            </div>
          </div>
        )}

        {/* Personalization banner for users without a vertical */}
        {!user.vertical && (
          <div className="bg-white border border-dashed border-[#e0dbd4] rounded-2xl p-4 sm:p-5 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-xl flex-shrink-0">🎯</span>
              <div>
                <p className="text-sm font-semibold text-[#0a0a0a]">Personalize your experience</p>
                <p className="text-xs text-[#8a8580]">Tell us your profession to unlock tailored content suggestions.</p>
              </div>
            </div>
            <Link
              href="/dashboard/onboarding"
              className="px-4 py-2 bg-[#e85d26] hover:bg-[#d14d1a] text-white rounded-full text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 text-center"
            >
              Set Up
            </Link>
          </div>
        )}

        {/* Recent Videos */}
        <RecentVideos videos={completedVideos} />

        {/* Quick Action */}
        <div className="mt-6 text-center">
          <Link
            href="/dashboard/editor"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#e85d26] hover:bg-[#d14d1a] text-white rounded-full text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Upload New Video
          </Link>
        </div>
      </div>
    </div>
  )
}
