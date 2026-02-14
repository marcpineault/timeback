'use client'

import { ScheduledPostData } from '@/hooks/useSchedule'

interface PostCardProps {
  post: ScheduledPostData
  onEdit: (post: ScheduledPostData) => void
  onRemove: (postId: string) => void
  onPublishNow?: (postId: string) => void
  publishingId?: string | null
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  QUEUED: { bg: 'bg-gray-500/20', text: 'text-gray-400', label: 'Queued' },
  SCHEDULED: { bg: 'bg-[rgba(232,93,38,0.1)]', text: 'text-[#e85d26]', label: 'Scheduled' },
  PROCESSING_VIDEO: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'Processing' },
  UPLOADING: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Uploading' },
  PUBLISHED: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Published' },
  FAILED: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Failed' },
  CANCELLED: { bg: 'bg-gray-500/20', text: 'text-gray-500', label: 'Cancelled' },
}

export default function PostCard({ post, onEdit, onRemove, onPublishNow, publishingId }: PostCardProps) {
  const status = STATUS_STYLES[post.status] || STATUS_STYLES.QUEUED

  const scheduledDate = new Date(post.scheduledFor)
  const timeStr = scheduledDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const dateStr = scheduledDate.toLocaleDateString([], { month: 'short', day: 'numeric' })

  const captionPreview = post.caption.split('\n')[0]?.slice(0, 80) || 'No caption'

  return (
    <div className="flex items-start gap-4 p-4 bg-[#f5f0e8] rounded-2xl hover:bg-[#e0dbd4] transition-colors">
      {/* Time */}
      <div className="flex-shrink-0 text-center w-16">
        <p className="text-[#0a0a0a] font-medium text-sm">{timeStr}</p>
        <p className="text-[#8a8580] text-xs">{dateStr}</p>
      </div>

      {/* Video info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[#0a0a0a] text-sm font-medium truncate">
            {post.video.originalName}
          </span>
          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${status.bg} ${status.text}`}>
            {status.label}
          </span>
        </div>
        <p className="text-[#8a8580] text-sm truncate">{captionPreview}</p>
        <div className="flex items-center gap-1 mt-1">
          <span className="text-[#8a8580] text-xs">@{post.instagramAccount.instagramUsername}</span>
        </div>
      </div>

      {/* Actions */}
      {post.status !== 'PUBLISHED' && post.status !== 'UPLOADING' && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {onPublishNow && (post.status === 'SCHEDULED' || post.status === 'QUEUED' || post.status === 'FAILED') && (
            <button
              onClick={() => onPublishNow(post.id)}
              disabled={publishingId === post.id}
              className="px-3 py-1.5 bg-[#e85d26] hover:bg-[#d14d1a] disabled:opacity-50 text-[#0a0a0a] rounded-full text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              {publishingId === post.id ? (
                <>
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Publishing...
                </>
              ) : (
                'Publish Now'
              )}
            </button>
          )}
          <button
            onClick={() => onEdit(post)}
            className="px-3 py-1.5 text-[#8a8580] hover:text-[#0a0a0a] hover:bg-[#e0dbd4] rounded-full text-xs transition-colors"
          >
            Edit
          </button>
          <button
            onClick={() => onRemove(post.id)}
            className="px-3 py-1.5 text-[#8a8580] hover:text-red-400 hover:bg-red-500/10 rounded-full text-xs transition-colors"
          >
            Remove
          </button>
        </div>
      )}

      {post.status === 'PUBLISHED' && post.igPermalink && (
        <a
          href={post.igPermalink}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 text-[#e85d26] hover:text-[#d14d1a] text-xs flex-shrink-0"
        >
          View Post
        </a>
      )}
    </div>
  )
}
