'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import InstagramConnect from '@/components/schedule/InstagramConnect'
import ScheduleBuilder from '@/components/schedule/ScheduleBuilder'
import QueueView from '@/components/schedule/QueueView'
import CalendarView from '@/components/schedule/CalendarView'
import PostEditor from '@/components/schedule/PostEditor'
import PublishedHistory from '@/components/schedule/PublishedHistory'
import {
  useInstagramAccounts,
  useScheduleSlots,
  usePostingQueue,
  ScheduledPostData,
} from '@/hooks/useSchedule'

type Tab = 'queue' | 'calendar' | 'published' | 'settings'

export default function ScheduleDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('queue')
  const [editingPost, setEditingPost] = useState<ScheduledPostData | null>(null)
  const [publishingId, setPublishingId] = useState<string | null>(null)
  const searchParams = useSearchParams()

  const { accounts, loading: accountsLoading, refetch: refetchAccounts } = useInstagramAccounts()
  const { slots, loading: slotsLoading, refetch: refetchSlots } = useScheduleSlots()
  const { queue, stats, loading: queueLoading, refetch: refetchQueue } = usePostingQueue()

  // Handle connection callback messages
  const connected = searchParams.get('connected')
  const error = searchParams.get('error')
  const pagesParam = searchParams.get('pages')

  useEffect(() => {
    if (connected === 'true') {
      refetchAccounts()
    }
  }, [connected, refetchAccounts])

  const selectedAccountId = accounts[0]?.id || ''

  async function handleRemovePost(postId: string) {
    if (!confirm('Remove this post from the queue?')) return

    try {
      await fetch(`/api/schedule/queue/${postId}`, { method: 'DELETE' })
      refetchQueue()
    } catch (err) {
      console.error('Failed to remove post:', err)
    }
  }

  async function handleSavePost(postId: string, data: { caption: string; scheduledFor?: string }) {
    try {
      await fetch(`/api/schedule/queue/${postId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      refetchQueue()
    } catch (err) {
      console.error('Failed to save post:', err)
    }
  }

  async function handlePublishNow(postId: string) {
    if (!confirm('Publish this post to Instagram right now?')) return

    setPublishingId(postId)
    try {
      const res = await fetch(`/api/schedule/queue/${postId}/publish`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Failed to publish post')
      }
      refetchQueue()
    } catch (err) {
      console.error('Failed to publish post:', err)
      alert('Failed to publish post. Please try again.')
    } finally {
      setPublishingId(null)
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'queue', label: 'Queue' },
    { id: 'calendar', label: 'Calendar' },
    { id: 'published', label: 'Published' },
    { id: 'settings', label: 'Settings' },
  ]

  const isLoading = accountsLoading || slotsLoading || queueLoading

  return (
    <div>
      {/* Connection alerts */}
      {connected === 'true' && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-full p-4 mb-6">
          <p className="text-green-400 text-sm">Instagram account connected successfully!</p>
        </div>
      )}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-full p-4 mb-6">
          <p className="text-red-400 text-sm font-medium mb-1">
            {error === 'missing_page_permissions'
              ? 'Page permissions not granted'
              : error === 'missing_instagram_permissions'
              ? 'Instagram permissions not granted'
              : error === 'no_facebook_pages'
              ? 'No Facebook Page selected'
              : error === 'no_instagram_business_account'
              ? 'No Instagram Business account found'
              : 'Connection failed'}
          </p>
          <p className="text-red-400/70 text-xs">
            {error === 'missing_page_permissions'
              ? 'Please try again and approve all permissions when Facebook asks.'
              : error === 'missing_instagram_permissions'
              ? 'Please try again and approve all permissions when Facebook asks.'
              : error === 'no_facebook_pages'
              ? 'Make sure to select your Facebook Page during the login flow. Try connecting again.'
              : error === 'no_instagram_business_account'
              ? `Your Facebook Page${pagesParam ? ` "${pagesParam}"` : ''} doesn't have a linked Instagram Business or Creator account. Link one in your Facebook Page settings under Linked Accounts, then try again.`
              : `Something went wrong (${error.replace(/_/g, ' ')}). Please try connecting again.`}
          </p>
        </div>
      )}

      {/* Page Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#0a0a0a]">Content Schedule</h1>
        <p className="text-[#8a8580] text-sm mt-1">
          Auto-schedule your edited videos to Instagram
        </p>
      </div>

      {/* No accounts connected */}
      {!accountsLoading && accounts.length === 0 ? (
        <InstagramConnect accounts={accounts} onConnected={refetchAccounts} />
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-1 mb-6 bg-white border border-[#e0dbd4] rounded-full p-1 w-fit">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-[#e85d26] text-[#0a0a0a]'
                    : 'text-[#8a8580] hover:text-[#0a0a0a]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {isLoading ? (
            <div className="text-[#8a8580] text-center py-12">Loading...</div>
          ) : (
            <>
              {activeTab === 'queue' && (
                <QueueView
                  queue={queue}
                  stats={stats}
                  onEditPost={setEditingPost}
                  onRemovePost={handleRemovePost}
                  onPublishNow={handlePublishNow}
                  publishingId={publishingId}
                />
              )}

              {activeTab === 'calendar' && (
                <div className="bg-white border border-[#e0dbd4] rounded-2xl p-6">
                  <CalendarView
                    onDayClick={() => {
                      setActiveTab('queue')
                    }}
                  />
                </div>
              )}

              {activeTab === 'published' && <PublishedHistory />}

              {activeTab === 'settings' && (
                <div className="space-y-6">
                  <InstagramConnect accounts={accounts} onConnected={refetchAccounts} />
                  {selectedAccountId && (
                    <ScheduleBuilder
                      slots={slots}
                      instagramAccountId={selectedAccountId}
                      onSlotsChanged={refetchSlots}
                    />
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Caption Editor Modal */}
      {editingPost && (
        <PostEditor
          post={editingPost}
          onSave={handleSavePost}
          onRegenerate={() => refetchQueue()}
          onClose={() => setEditingPost(null)}
        />
      )}
    </div>
  )
}
