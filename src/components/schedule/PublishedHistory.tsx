'use client'

import { useState, useEffect } from 'react'

interface PublishedPost {
  id: string
  caption: string
  publishedAt: string | null
  status: string
  igPermalink: string | null
  lastError: string | null
  video: { originalName: string; processedUrl: string | null }
  instagramAccount: { instagramUsername: string; instagramProfilePic: string | null }
}

export default function PublishedHistory() {
  const [posts, setPosts] = useState<PublishedPost[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchHistory()
  }, [])

  async function fetchHistory() {
    try {
      const res = await fetch('/api/schedule/history?limit=25')
      if (res.ok) {
        const data = await res.json()
        setPosts(data.posts)
        setTotal(data.total)
      }
    } catch (err) {
      console.error('Failed to fetch history:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="text-[#8a8580] text-center py-8">Loading history...</div>
  }

  if (posts.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-[#8a8580] mb-2">No published posts yet</p>
        <p className="text-[#8a8580] text-sm">
          Posts will appear here after they are published to Instagram.
        </p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-[#8a8580] text-sm mb-4">{total} total posts</p>
      <div className="space-y-3">
        {posts.map((post) => (
          <div
            key={post.id}
            className="flex items-center gap-4 p-4 bg-[#f5f0e8] rounded-2xl"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[#0a0a0a] text-sm font-medium truncate">
                  {post.video.originalName}
                </span>
                <span
                  className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                    post.status === 'PUBLISHED'
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-red-500/20 text-red-400'
                  }`}
                >
                  {post.status === 'PUBLISHED' ? 'Published' : 'Failed'}
                </span>
              </div>
              <p className="text-[#8a8580] text-xs">
                @{post.instagramAccount.instagramUsername}
                {post.publishedAt && (
                  <> &middot; {new Date(post.publishedAt).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}</>
                )}
              </p>
              {post.status === 'FAILED' && post.lastError && (
                <p className="text-red-400 text-xs mt-1">{post.lastError}</p>
              )}
            </div>
            {post.igPermalink && (
              <a
                href={post.igPermalink}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 text-[#e85d26] hover:text-[#d14d1a] text-sm flex-shrink-0"
              >
                View
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
