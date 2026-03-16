'use client'

import Link from 'next/link'

interface Video {
  id: string
  originalName: string
  status: string
  duration: number | null
  silenceRemoved: number | null
  createdAt: Date | string
}

function formatDuration(seconds: number): string {
  if (seconds >= 3600) {
    return `${Math.floor(seconds / 3600)}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  }
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function formatRelativeDate(date: Date | string): string {
  const d = new Date(date)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function RecentVideos({ videos }: { videos: Video[] }) {
  if (videos.length === 0) {
    return (
      <div className="bg-white border border-dashed border-[#e0dbd4] rounded-2xl p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-4 bg-[#f5f0e8] rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-[#8a8580]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-[#0a0a0a] mb-1">No videos yet</h3>
        <p className="text-xs text-[#8a8580] mb-4">Upload your first video to get started.</p>
        <Link
          href="/dashboard/editor"
          className="inline-block px-4 py-2 bg-[#e85d26] hover:bg-[#d14d1a] text-white rounded-full text-sm font-medium transition-colors"
        >
          Go to Editor
        </Link>
      </div>
    )
  }

  const recent = videos.slice(0, 10)

  return (
    <div className="bg-white border border-[#e0dbd4] rounded-2xl p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base sm:text-lg font-semibold text-[#0a0a0a]" style={{ fontFamily: "'Instrument Serif', serif" }}>
          Recent Videos
        </h2>
        <Link
          href="/dashboard/editor"
          className="text-xs text-[#e85d26] hover:text-[#d14d1a] font-medium transition-colors"
        >
          Go to Editor
        </Link>
      </div>
      <div className="space-y-3">
        {recent.map((video) => (
          <div
            key={video.id}
            className="flex items-center gap-3 p-3 rounded-xl bg-[#faf7f2] border border-[#e0dbd4]/50"
          >
            {/* Video icon */}
            <div className="w-10 h-10 bg-[#e0dbd4]/50 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-[#8a8580]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#0a0a0a] truncate">
                {video.originalName}
              </p>
              <div className="flex items-center gap-2 text-xs text-[#8a8580]">
                {video.duration !== null && (
                  <span>{formatDuration(video.duration)}</span>
                )}
                {video.duration !== null && video.silenceRemoved !== null && (
                  <span className="text-[#e0dbd4]">&middot;</span>
                )}
                {video.silenceRemoved !== null && video.silenceRemoved > 0 && (
                  <span className="text-[#e85d26]">{video.silenceRemoved}s trimmed</span>
                )}
              </div>
            </div>
            {/* Date */}
            <div className="text-xs text-[#8a8580] flex-shrink-0">
              {formatRelativeDate(video.createdAt)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
