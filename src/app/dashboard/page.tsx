import { redirect } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { getOrCreateUser, getUserUsage } from '@/lib/user'
import { PLANS } from '@/lib/plans'
import { getEnabledFeatures } from '@/lib/featureFlags'
import VideoProcessor from './VideoProcessor'
import WelcomeOverlay from '@/components/WelcomeOverlay'
// Google Drive disabled - will be enabled later
// import DriveSettings from '@/components/DriveSettings'
import Link from 'next/link'

interface Video {
  id: string
  originalName: string
  status: string
  createdAt: Date
  processedUrl: string | null
}

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
    // Show a helpful error page instead of crashing
    return (
      <div className="min-h-screen bg-[#0F0F14] flex items-center justify-center">
        <div className="bg-[#1A1A24] rounded-xl p-8 max-w-md text-center">
          <h1 className="text-xl font-semibold text-white mb-2">Something went wrong</h1>
          <p className="text-gray-400 mb-4">
            There was an issue loading your dashboard. Please try signing out and back in.
          </p>
          <Link
            href="/sign-in"
            className="inline-block px-4 py-2 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white rounded-lg font-medium transition-colors"
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

  return (
    <div className="min-h-screen bg-[#0F0F14]">
      <WelcomeOverlay isNewUser={isNewUser} />
      {/* Header */}
      <header className="border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo.svg" alt="TimeBack" className="w-8 h-8" />
            <span className="text-xl font-bold text-white">TimeBack</span>
          </Link>
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Google Drive disabled - will be enabled later */}
            {/* <DriveSettings /> */}
            {getEnabledFeatures(user.email).instagramScheduling && (
              <Link
                href="/dashboard/schedule"
                className="text-gray-400 hover:text-white transition-colors text-sm"
              >
                Schedule
              </Link>
            )}
            {getEnabledFeatures(user.email).ideate && (
              <Link
                href="/dashboard/ideate"
                className="text-gray-400 hover:text-white transition-colors text-sm"
              >
                Ideate
              </Link>
            )}
            <a
              href="https://www.youtube.com/playlist?list=PLhATaQNX0bxMeX0e8AA-TSk8L0g3t-QX7"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-white transition-colors text-sm"
            >
              Tutorials
            </a>
            <Link
              href="/account/subscription"
              className="text-gray-400 hover:text-white transition-colors text-sm"
            >
              Subscription
            </Link>
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {/* Usage Card */}
        <div className="bg-[#1A1A24] rounded-xl p-4 sm:p-6 mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-white">
                {PLANS[usage.plan as keyof typeof PLANS].name} Plan
              </h2>
              <p className="text-gray-400 text-sm">
                {usage.planDetails.videosPerMonth
                  ? `${usage.videosUsed} of ${usage.planDetails.videosPerMonth} videos used this month`
                  : `${usage.videosUsed} videos used this month (unlimited)`}
              </p>
            </div>
            {usage.plan === 'FREE' ? (
              <Link
                href="/pricing"
                className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white rounded-lg text-sm font-medium transition-colors text-center"
              >
                Upgrade to Pro
              </Link>
            ) : (
              <Link
                href="/account/subscription"
                className="px-4 py-2 bg-[#2A2A3A] hover:bg-[#3A3A4A] text-white rounded-lg text-sm font-medium transition-colors text-center"
              >
                Manage Plan
              </Link>
            )}
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div
              className="bg-gradient-to-r from-indigo-500 to-violet-500 h-2 rounded-full transition-all"
              style={{ width: `${Math.min(usagePercentage, 100)}%` }}
            />
          </div>
          {usage.videosRemaining !== null && usage.videosRemaining <= 0 && (
            <p className="text-amber-400 text-sm mt-2">
              You&apos;ve reached your monthly limit. Upgrade to process more videos.
            </p>
          )}
        </div>

        {/* Video Processor */}
        <VideoProcessor
          userId={user.id}
          canProcess={usage.videosRemaining === null || usage.videosRemaining > 0}
          videosRemaining={usage.videosRemaining ?? Infinity}
          hasWatermark={usage.planDetails.watermark}
          enabledFeatures={getEnabledFeatures(user.email)}
        />

        {/* Recent Videos */}
        {usage.recentVideos.length > 0 && (
          <div className="mt-6 sm:mt-8">
            <h3 className="text-base sm:text-lg font-semibold text-white mb-3 sm:mb-4">Recent Videos</h3>

            {/* Mobile card view */}
            <div className="sm:hidden space-y-3">
              {usage.recentVideos.map((video: Video) => (
                <div key={video.id} className="bg-[#1A1A24] rounded-xl p-4">
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-white text-sm font-medium truncate flex-1 mr-2">{video.originalName}</p>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                      video.status === 'COMPLETED' ? 'bg-green-500/20 text-green-400' :
                      video.status === 'PROCESSING' ? 'bg-violet-500/20 text-violet-400' :
                      video.status === 'FAILED' ? 'bg-red-500/20 text-red-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>
                      {video.status}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 text-xs">
                      {new Date(video.createdAt).toLocaleDateString()}
                    </span>
                    {video.status === 'COMPLETED' && video.processedUrl && (
                      <a
                        href={video.processedUrl}
                        className="text-cyan-400 hover:text-cyan-300 text-sm font-medium"
                        download
                      >
                        Download
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table view */}
            <div className="hidden sm:block bg-[#1A1A24] rounded-xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-700/50">
                  <tr>
                    <th className="text-left text-gray-400 text-sm font-medium px-4 py-3">Name</th>
                    <th className="text-left text-gray-400 text-sm font-medium px-4 py-3">Status</th>
                    <th className="text-left text-gray-400 text-sm font-medium px-4 py-3">Date</th>
                    <th className="text-left text-gray-400 text-sm font-medium px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {usage.recentVideos.map((video: Video) => (
                    <tr key={video.id}>
                      <td className="px-4 py-3 text-white">{video.originalName}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          video.status === 'COMPLETED' ? 'bg-green-500/20 text-green-400' :
                          video.status === 'PROCESSING' ? 'bg-violet-500/20 text-violet-400' :
                          video.status === 'FAILED' ? 'bg-red-500/20 text-red-400' :
                          'bg-gray-500/20 text-gray-400'
                        }`}>
                          {video.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-sm">
                        {new Date(video.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        {video.status === 'COMPLETED' && video.processedUrl && (
                          <a
                            href={video.processedUrl}
                            className="text-cyan-400 hover:text-cyan-300 text-sm"
                            download
                          >
                            Download
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
