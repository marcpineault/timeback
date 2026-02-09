'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface VideoToSchedule {
  videoId: string
  originalName: string
  transcript?: string
}

interface PreflightData {
  ready: boolean
  reason?: string
  accounts: { id: string; instagramUsername: string; instagramProfilePic: string | null }[]
  slots: { id: string; dayOfWeek: number; timeOfDay: string }[]
  nextSlots: string[]
  slotsPerWeek?: number
  daysOfContent?: number
}

interface ScheduleModalProps {
  videos: VideoToSchedule[]
  onClose: () => void
  onScheduled: (count: number) => void
}

type Step = 'select' | 'preview' | 'confirm' | 'done'

export default function ScheduleModal({ videos, onClose, onScheduled }: ScheduleModalProps) {
  const [step, setStep] = useState<Step>('select')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(videos.map((v) => v.videoId)))
  const [preflight, setPreflight] = useState<PreflightData | null>(null)
  const [preflightLoading, setPreflightLoading] = useState(false)
  const [captions, setCaptions] = useState<Record<string, { caption: string; hashtags: string[] }>>({})
  const [captionsLoading, setCaptionsLoading] = useState(false)
  const [editingCaption, setEditingCaption] = useState<string | null>(null)
  const [scheduling, setScheduling] = useState(false)
  const [result, setResult] = useState<{ scheduled: number; failed: number } | null>(null)

  const selectedVideos = videos.filter((v) => selectedIds.has(v.videoId))

  function toggleVideo(videoId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(videoId)) {
        next.delete(videoId)
      } else {
        next.add(videoId)
      }
      return next
    })
  }

  function selectAll() {
    setSelectedIds(new Set(videos.map((v) => v.videoId)))
  }

  function selectNone() {
    setSelectedIds(new Set())
  }

  // Run preflight check when moving to preview
  async function handleContinueToPreview() {
    setPreflightLoading(true)
    try {
      const res = await fetch(`/api/schedule/preflight?videoCount=${selectedIds.size}`)
      if (res.ok) {
        const data = await res.json()
        setPreflight(data)

        if (data.ready) {
          // Generate caption previews
          setCaptionsLoading(true)
          setStep('preview')

          const captionRes = await fetch('/api/captions/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoIds: Array.from(selectedIds) }),
          })

          if (captionRes.ok) {
            const captionData = await captionRes.json()
            setCaptions(captionData.previews || {})
          }
          setCaptionsLoading(false)
        }
        // If not ready, stay on select step — the UI will show the setup prompt
      }
    } catch {
      // error handled in UI
    } finally {
      setPreflightLoading(false)
    }
  }

  async function handleSchedule() {
    if (!preflight?.accounts[0]) return

    setScheduling(true)
    const accountId = preflight.accounts[0].id

    let scheduled = 0
    let failed = 0

    for (const videoId of selectedIds) {
      try {
        const caption = captions[videoId]?.caption
        const res = await fetch('/api/schedule/queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoId,
            instagramAccountId: accountId,
            caption: caption || undefined,
            autoGenerateCaption: !caption,
          }),
        })

        if (res.ok) {
          scheduled++
        } else {
          failed++
        }
      } catch {
        failed++
      }
    }

    setResult({ scheduled, failed })
    setStep('done')
    setScheduling(false)
    onScheduled(scheduled)
  }

  function formatSlotTime(iso: string): string {
    const d = new Date(iso)
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) +
      ' at ' +
      d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }

  const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#1A1A24] rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-800 flex-shrink-0">
          <h3 className="text-lg font-semibold text-white">
            {step === 'select' && 'Schedule to Instagram'}
            {step === 'preview' && 'Review Captions'}
            {step === 'confirm' && 'Confirm Schedule'}
            {step === 'done' && 'Scheduled!'}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-xl">
            x
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-auto flex-1">
          {/* ── Step 1: Select Videos ── */}
          {step === 'select' && (
            <div>
              {/* Smart empty states */}
              {preflight && !preflight.ready && (
                <div className="mb-5 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  {preflight.reason === 'no_account' && (
                    <div>
                      <p className="text-amber-400 font-medium text-sm mb-1">No Instagram account connected</p>
                      <p className="text-gray-400 text-sm mb-3">
                        Connect your Instagram Business or Creator account to start scheduling.
                      </p>
                      <Link
                        href="/dashboard/schedule"
                        className="inline-block px-4 py-2 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-lg text-sm font-medium"
                      >
                        Connect Instagram
                      </Link>
                    </div>
                  )}
                  {preflight.reason === 'no_slots' && (
                    <div>
                      <p className="text-amber-400 font-medium text-sm mb-1">No posting schedule set up</p>
                      <p className="text-gray-400 text-sm mb-3">
                        Set up your weekly posting times (e.g., 3x/day at 9am, 1pm, 6pm) before scheduling videos.
                      </p>
                      <Link
                        href="/dashboard/schedule"
                        className="inline-block px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-lg text-sm font-medium"
                      >
                        Set Up Schedule
                      </Link>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between mb-3">
                <p className="text-gray-400 text-sm">
                  {selectedIds.size} of {videos.length} selected
                </p>
                <div className="flex gap-2">
                  <button onClick={selectAll} className="text-violet-400 hover:text-violet-300 text-sm">
                    Select all
                  </button>
                  <span className="text-gray-600">|</span>
                  <button onClick={selectNone} className="text-gray-400 hover:text-gray-300 text-sm">
                    None
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-64 overflow-auto">
                {videos.map((video) => (
                  <label
                    key={video.videoId}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedIds.has(video.videoId)
                        ? 'bg-violet-500/10 border border-violet-500/30'
                        : 'bg-[#2A2A3A] border border-transparent hover:border-gray-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(video.videoId)}
                      onChange={() => toggleVideo(video.videoId)}
                      className="w-4 h-4 rounded border-gray-600 text-violet-500 focus:ring-violet-500 bg-[#2A2A3A]"
                    />
                    <span className="text-white text-sm truncate">{video.originalName}</span>
                    {video.transcript && (
                      <span className="text-green-400/60 text-xs flex-shrink-0">has transcript</span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 2: Caption Preview ── */}
          {step === 'preview' && (
            <div>
              {captionsLoading ? (
                <div className="text-center py-12">
                  <svg className="w-8 h-8 animate-spin text-violet-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <p className="text-gray-400 text-sm">Generating AI captions...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Schedule summary */}
                  {preflight && (
                    <div className="p-3 bg-[#2A2A3A] rounded-lg text-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-gray-400">Posting to:</span>
                        <span className="text-white font-medium">@{preflight.accounts[0]?.instagramUsername}</span>
                      </div>
                      <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                        <span>{preflight.slotsPerWeek} slots/week</span>
                        <span>{selectedIds.size} videos = ~{preflight.daysOfContent} days of content</span>
                      </div>
                    </div>
                  )}

                  <p className="text-gray-400 text-sm">Review and edit captions before scheduling:</p>

                  {selectedVideos.map((video, idx) => {
                    const caption = captions[video.videoId]
                    const slotTime = preflight?.nextSlots[idx]

                    return (
                      <div key={video.videoId} className="bg-[#2A2A3A] rounded-lg p-4">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="min-w-0">
                            <p className="text-white text-sm font-medium truncate">{video.originalName}</p>
                            {slotTime && (
                              <p className="text-violet-400 text-xs mt-0.5">{formatSlotTime(slotTime)}</p>
                            )}
                          </div>
                          <button
                            onClick={() => setEditingCaption(editingCaption === video.videoId ? null : video.videoId)}
                            className="text-gray-400 hover:text-white text-xs flex-shrink-0 px-2 py-1 rounded hover:bg-[#3A3A4A] transition-colors"
                          >
                            {editingCaption === video.videoId ? 'Collapse' : 'Edit'}
                          </button>
                        </div>

                        {editingCaption === video.videoId ? (
                          <textarea
                            value={caption?.caption || ''}
                            onChange={(e) => {
                              setCaptions((prev) => ({
                                ...prev,
                                [video.videoId]: {
                                  ...prev[video.videoId],
                                  caption: e.target.value,
                                  hashtags: prev[video.videoId]?.hashtags || [],
                                },
                              }))
                            }}
                            className="w-full h-40 bg-[#1A1A24] text-white rounded-lg p-3 text-sm border border-gray-700 focus:border-violet-500 outline-none resize-none mt-1"
                          />
                        ) : (
                          <p className="text-gray-400 text-sm line-clamp-3">
                            {caption?.caption?.split('\n')[0] || 'Generating...'}
                          </p>
                        )}

                        {caption?.caption && (
                          <p className={`text-xs mt-1 ${caption.caption.length > 2200 ? 'text-red-400' : 'text-gray-600'}`}>
                            {caption.caption.length}/2,200
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Done ── */}
          {step === 'done' && result && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h4 className="text-xl font-semibold text-white mb-2">
                {result.scheduled} video{result.scheduled !== 1 ? 's' : ''} scheduled!
              </h4>
              {result.failed > 0 && (
                <p className="text-amber-400 text-sm mb-2">
                  {result.failed} failed — check your schedule settings.
                </p>
              )}
              <p className="text-gray-400 text-sm mb-6">
                AI captions have been generated. You can edit them anytime before they post.
              </p>
              <div className="flex items-center justify-center gap-3">
                <Link
                  href="/dashboard/schedule"
                  className="px-5 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  View Schedule
                </Link>
                <button
                  onClick={onClose}
                  className="px-5 py-2 bg-[#2A2A3A] hover:bg-[#3A3A4A] text-gray-300 rounded-lg text-sm font-medium transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step !== 'done' && (
          <div className="flex items-center justify-between p-5 border-t border-gray-800 flex-shrink-0">
            <button
              onClick={step === 'select' ? onClose : () => setStep('select')}
              className="text-gray-400 hover:text-white transition-colors text-sm"
            >
              {step === 'select' ? 'Cancel' : 'Back'}
            </button>

            {step === 'select' && (
              <button
                onClick={handleContinueToPreview}
                disabled={selectedIds.size === 0 || preflightLoading}
                className="px-5 py-2 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                {preflightLoading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Checking...
                  </>
                ) : (
                  `Continue with ${selectedIds.size} video${selectedIds.size !== 1 ? 's' : ''}`
                )}
              </button>
            )}

            {step === 'preview' && (
              <button
                onClick={handleSchedule}
                disabled={scheduling || captionsLoading}
                className="px-5 py-2 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                {scheduling ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Scheduling...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Schedule {selectedIds.size} video{selectedIds.size !== 1 ? 's' : ''}
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
