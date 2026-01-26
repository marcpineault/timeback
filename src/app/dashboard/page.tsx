import { redirect } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { getOrCreateUser, getUserUsage } from '@/lib/user'
import { PLANS } from '@/lib/plans'
import VideoProcessor from './VideoProcessor'
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
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="bg-gray-800 rounded-xl p-8 max-w-md text-center">
          <h1 className="text-xl font-semibold text-white mb-2">Something went wrong</h1>
          <p className="text-gray-400 mb-4">
            There was an issue loading your dashboard. Please try signing out and back in.
          </p>
          <a
            href="/sign-in"
            className="inline-block px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
          >
            Sign In Again
          </a>
        </div>
      </div>
    )
  }

  const usagePercentage = usage.planDetails.videosPerMonth
    ? (usage.videosUsed / usage.planDetails.videosPerMonth) * 100
    : 0

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-white">TimeBack</Link>
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Google Drive disabled - will be enabled later */}
            {/* <DriveSettings /> */}
            <Link
              href="/pricing"
              className="text-gray-400 hover:text-white transition-colors text-sm"
            >
              Upgrade
            </Link>
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {/* Usage Card */}
        <div className="bg-gray-800 rounded-xl p-4 sm:p-6 mb-6 sm:mb-8">
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
            {usage.plan === 'FREE' && (
              <Link
                href="/pricing"
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors text-center"
              >
                Upgrade to Pro
              </Link>
            )}
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all"
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
        />

        {/* Recent Videos */}
        {usage.recentVideos.length > 0 && (
          <div className="mt-6 sm:mt-8">
            <h3 className="text-base sm:text-lg font-semibold text-white mb-3 sm:mb-4">Recent Videos</h3>

            {/* Mobile card view */}
            <div className="sm:hidden space-y-3">
              {usage.recentVideos.map((video: Video) => (
                <div key={video.id} className="bg-gray-800 rounded-xl p-4">
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-white text-sm font-medium truncate flex-1 mr-2">{video.originalName}</p>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                      video.status === 'COMPLETED' ? 'bg-green-500/20 text-green-400' :
                      video.status === 'PROCESSING' ? 'bg-blue-500/20 text-blue-400' :
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
                        className="text-blue-400 hover:text-blue-300 text-sm font-medium"
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
            <div className="hidden sm:block bg-gray-800 rounded-xl overflow-hidden">
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
                          video.status === 'PROCESSING' ? 'bg-blue-500/20 text-blue-400' :
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
                            className="text-blue-400 hover:text-blue-300 text-sm"
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
