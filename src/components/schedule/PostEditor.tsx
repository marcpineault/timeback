'use client'

import { useState } from 'react'
import { ScheduledPostData } from '@/hooks/useSchedule'

interface PostEditorProps {
  post: ScheduledPostData
  onSave: (postId: string, data: { caption: string; scheduledFor?: string }) => void
  onRegenerate: (postId: string) => void
  onClose: () => void
}

export default function PostEditor({ post, onSave, onRegenerate, onClose }: PostEditorProps) {
  const [caption, setCaption] = useState(post.caption)
  const [saving, setSaving] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const initDate = new Date(post.scheduledFor)
  const initDateStr = `${initDate.getFullYear()}-${String(initDate.getMonth() + 1).padStart(2, '0')}-${String(initDate.getDate()).padStart(2, '0')}`
  const initTimeStr = initDate.toTimeString().slice(0, 5)

  const [scheduledDate, setScheduledDate] = useState(initDateStr)
  const [scheduledTime, setScheduledTime] = useState(initTimeStr)

  const charCount = caption.length
  const isOverLimit = charCount > 2200

  const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`)
  const isInPast = scheduledDateTime < new Date()
  const hasTimeChanged = scheduledDate !== initDateStr || scheduledTime !== initTimeStr

  async function handleSave() {
    setSaving(true)
    try {
      const data: { caption: string; scheduledFor?: string } = { caption }
      if (hasTimeChanged) {
        data.scheduledFor = scheduledDateTime.toISOString()
      }
      await onSave(post.id, data)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  async function handleRegenerate() {
    setRegenerating(true)
    try {
      const res = await fetch(`/api/captions/regenerate/${post.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        const data = await res.json()
        setCaption(data.caption.fullCaption)
        onRegenerate(post.id)
      }
    } catch (err) {
      console.error('Failed to regenerate:', err)
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-[#e0dbd4] rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#e0dbd4]">
          <h3 className="text-lg font-semibold text-[#0a0a0a]">Edit Post</h3>
          <button
            onClick={onClose}
            className="text-[#8a8580] hover:text-[#0a0a0a] transition-colors text-xl"
          >
            x
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 overflow-auto">
          <div className="flex gap-5">
            {/* Video Info */}
            <div className="flex-shrink-0 w-36">
              <div className="bg-[#f5f0e8] rounded-2xl p-3 mb-3">
                <p className="text-[#0a0a0a] text-sm font-medium truncate">{post.video.originalName}</p>
                <p className="text-[#8a8580] text-xs mt-1">@{post.instagramAccount.instagramUsername}</p>
              </div>
              <div className="text-sm space-y-2">
                <p className="text-[#8a8580]">Scheduled:</p>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full bg-[#f5f0e8] text-[#0a0a0a] rounded-2xl px-3 py-1.5 text-sm border border-[#e0dbd4] focus:border-[#e85d26] outline-none"
                />
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="w-full bg-[#f5f0e8] text-[#0a0a0a] rounded-2xl px-3 py-1.5 text-sm border border-[#e0dbd4] focus:border-[#e85d26] outline-none"
                />
                {isInPast && (
                  <p className="text-red-400 text-xs">Cannot schedule in the past</p>
                )}
              </div>
            </div>

            {/* Caption Editor */}
            <div className="flex-1">
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="w-full h-64 bg-[#f5f0e8] text-[#0a0a0a] rounded-2xl p-4 text-sm border border-[#e0dbd4] focus:border-[#e85d26] outline-none resize-none"
                placeholder="Write your Instagram caption..."
              />
              <div className="flex items-center justify-between mt-2">
                <button
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  className="text-[#e85d26] hover:text-[#d14d1a] text-sm transition-colors disabled:opacity-50"
                >
                  {regenerating ? 'Regenerating...' : 'Regenerate Caption'}
                </button>
                <span className={`text-sm ${isOverLimit ? 'text-red-400' : 'text-[#8a8580]'}`}>
                  {charCount}/2,200
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-[#e0dbd4]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[#8a8580] hover:text-[#0a0a0a] transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || isOverLimit || isInPast}
            className="px-5 py-2 bg-[#e85d26] hover:bg-[#d14d1a] text-[#0a0a0a] rounded-full text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
