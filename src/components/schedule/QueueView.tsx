'use client'

import { ScheduledPostData, QueueStats } from '@/hooks/useSchedule'
import PostCard from './PostCard'

interface QueueViewProps {
  queue: ScheduledPostData[]
  stats: QueueStats | null
  onEditPost: (post: ScheduledPostData) => void
  onRemovePost: (postId: string) => void
}

export default function QueueView({ queue, stats, onEditPost, onRemovePost }: QueueViewProps) {
  // Group posts by date
  const grouped: Record<string, ScheduledPostData[]> = {}
  queue.forEach((post) => {
    const dateKey = new Date(post.scheduledFor).toLocaleDateString([], {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })
    if (!grouped[dateKey]) grouped[dateKey] = []
    grouped[dateKey].push(post)
  })

  const today = new Date().toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div>
      {/* Stats Bar */}
      {stats && (
        <div className="flex items-center gap-6 mb-6 text-sm">
          <div>
            <span className="text-gray-500">Scheduled: </span>
            <span className="text-white font-medium">{stats.scheduled}</span>
          </div>
          <div>
            <span className="text-gray-500">Published: </span>
            <span className="text-green-400 font-medium">{stats.published}</span>
          </div>
          {stats.failed > 0 && (
            <div>
              <span className="text-gray-500">Failed: </span>
              <span className="text-red-400 font-medium">{stats.failed}</span>
            </div>
          )}
          {stats.nextPostAt && (
            <div>
              <span className="text-gray-500">Next post: </span>
              <span className="text-violet-400 font-medium">
                {new Date(stats.nextPostAt).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Queue */}
      {queue.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400 mb-2">No posts in queue</p>
          <p className="text-gray-500 text-sm">
            Process some videos and add them to your schedule to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([dateLabel, posts]) => (
            <div key={dateLabel}>
              <h4 className="text-gray-400 text-sm font-medium mb-3">
                {dateLabel === today ? 'Today' : dateLabel}
              </h4>
              <div className="space-y-2">
                {posts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onEdit={onEditPost}
                    onRemove={onRemovePost}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
