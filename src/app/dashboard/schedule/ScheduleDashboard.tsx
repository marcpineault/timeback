'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import InstagramConnect from '@/components/schedule/InstagramConnect'
import ScheduleBuilder from '@/components/schedule/ScheduleBuilder'
import QueueView from '@/components/schedule/QueueView'
import CalendarView from '@/components/schedule/CalendarView'
import CaptionEditor from '@/components/schedule/CaptionEditor'
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
  const searchParams = useSearchParams()

  const { accounts, loading: accountsLoading, refetch: refetchAccounts } = useInstagramAccounts()
  const { slots, loading: slotsLoading, refetch: refetchSlots } = useScheduleSlots()
  const { queue, stats, loading: queueLoading, refetch: refetchQueue } = usePostingQueue()

  // Handle connection callback messages
  const connected = searchParams.get('connected')
  const error = searchParams.get('error')

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

  async function handleSaveCaption(postId: string, caption: string) {
    try {
      await fetch(`/api/schedule/queue/${postId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption }),
      })
      refetchQueue()
    } catch (err) {
      console.error('Failed to save caption:', err)
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
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mb-6">
          <p className="text-green-400 text-sm">Instagram account connected successfully!</p>
        </div>
      )}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
          <p className="text-red-400 text-sm">
            {error === 'missing_page_permissions'
              ? 'Facebook Page permissions were not granted. Please disconnect the app from your Facebook settings (Settings → Business Integrations), then try connecting again and approve all requested permissions.'
              : error === 'no_facebook_pages'
              ? 'No Facebook Pages found for your account. You need a Facebook Page to connect an Instagram Business account. Create one at facebook.com/pages/create, then link your Instagram account to it.'
              : error === 'no_instagram_business_account'
              ? 'Your Facebook Page(s) were found but none have a linked Instagram Business account. In the Instagram app, go to Settings → Account → Switch to Professional Account, then link it to your Facebook Page.'
              : `Connection error: ${error.replace(/_/g, ' ')}`}
          </p>
        </div>
      )}

      {/* Page Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Content Schedule</h1>
        <p className="text-gray-500 text-sm mt-1">
          Auto-schedule your edited videos to Instagram
        </p>
      </div>

      {/* No accounts connected */}
      {!accountsLoading && accounts.length === 0 ? (
        <div>
          <InstagramConnect accounts={accounts} onConnected={refetchAccounts} />
          <div className="mt-6 bg-[#1A1A24] rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-3">How it works</h3>
            <div className="space-y-3 text-gray-400 text-sm">
              <p>1. Connect your Instagram Business or Creator account</p>
              <p>2. Set up your weekly posting schedule (e.g., 3x/day at 9am, 1pm, 6pm)</p>
              <p>3. Upload and process your videos in the Editor</p>
              <p>4. Add processed videos to your schedule queue</p>
              <p>5. AI generates captions for each post</p>
              <p>6. Videos auto-publish to Instagram at your scheduled times</p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-1 mb-6 bg-[#1A1A24] rounded-lg p-1 w-fit">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-violet-500 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {isLoading ? (
            <div className="text-gray-500 text-center py-12">Loading...</div>
          ) : (
            <>
              {activeTab === 'queue' && (
                <QueueView
                  queue={queue}
                  stats={stats}
                  onEditPost={setEditingPost}
                  onRemovePost={handleRemovePost}
                />
              )}

              {activeTab === 'calendar' && (
                <div className="bg-[#1A1A24] rounded-xl p-6">
                  <CalendarView
                    onDayClick={(date) => {
                      console.log('Clicked day:', date)
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
        <CaptionEditor
          post={editingPost}
          onSave={handleSaveCaption}
          onRegenerate={() => refetchQueue()}
          onClose={() => setEditingPost(null)}
        />
      )}
    </div>
  )
}
