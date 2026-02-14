'use client'

import { rateScript, type ScriptData } from '@/hooks/useIdeate'

interface Props {
  scripts: ScriptData[]
  loading: boolean
  onViewScript: (script: ScriptData) => void
  onOpenTeleprompter: (script: ScriptData) => void
  onRefresh: () => void
}

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: 'bg-gray-500/20', text: 'text-gray-400' },
  READY: { bg: 'bg-[rgba(232,93,38,0.1)]', text: 'text-[#e85d26]' },
  FILMED: { bg: 'bg-green-500/20', text: 'text-green-400' },
  ARCHIVED: { bg: 'bg-gray-500/20', text: 'text-gray-500' },
}

export default function ScriptList({ scripts, loading, onViewScript, onOpenTeleprompter, onRefresh }: Props) {
  async function handleRate(e: React.MouseEvent, script: ScriptData, rating: 'up' | 'down') {
    e.stopPropagation()
    const newRating = script.rating === rating ? null : rating
    const success = await rateScript(script.id, newRating)
    if (success) onRefresh()
  }

  async function handleDelete(e: React.MouseEvent, script: ScriptData) {
    e.stopPropagation()
    if (!confirm('Delete this script?')) return
    try {
      await fetch(`/api/ideate/scripts/${script.id}`, { method: 'DELETE' })
      onRefresh()
    } catch {
      console.error('Failed to delete script')
    }
  }

  if (loading) {
    return <div className="text-[#8a8580] text-center py-12">Loading scripts...</div>
  }

  if (scripts.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-[#8a8580] mb-2">No scripts yet</p>
        <p className="text-[#8a8580] text-sm">Generate a script from one of your ideas in the Ideas tab.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {scripts.map((script) => {
        const status = STATUS_STYLES[script.status] || STATUS_STYLES.DRAFT

        return (
          <div
            key={script.id}
            onClick={() => onViewScript(script)}
            className="bg-white border border-[#e0dbd4] rounded-full p-4 hover:bg-[#faf7f2] transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-[#0a0a0a] font-medium text-sm truncate">{script.title}</h3>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${status.bg} ${status.text}`}>
                    {script.status}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-[#8a8580]">
                  {script.idea && (
                    <span>From: {script.idea.title}</span>
                  )}
                  <span>{script.wordCount} words</span>
                  <span>~{script.estimatedDuration}s</span>
                  <span>{new Date(script.createdAt).toLocaleDateString()}</span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                {/* Rating */}
                <button
                  onClick={(e) => handleRate(e, script, 'up')}
                  className={`p-1 rounded transition-colors ${
                    script.rating === 'up' ? 'text-green-400' : 'text-[#8a8580] hover:text-green-400'
                  }`}
                  title="Good script"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                  </svg>
                </button>
                <button
                  onClick={(e) => handleRate(e, script, 'down')}
                  className={`p-1 rounded transition-colors ${
                    script.rating === 'down' ? 'text-red-400' : 'text-[#8a8580] hover:text-red-400'
                  }`}
                  title="Bad script"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018c.163 0 .326.02.485.06L17 4m-7 10v2a2 2 0 002 2h.095c.5 0 .905-.405.905-.905 0-.714.211-1.412.608-2.006L17 13V4m-7 10h2m5-6h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
                  </svg>
                </button>

                {/* Actions */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpenTeleprompter(script)
                  }}
                  className="px-3 py-1.5 bg-[#f5f0e8] hover:bg-[#e0dbd4] text-[#0a0a0a] rounded-md text-xs font-medium transition-colors"
                >
                  Teleprompter
                </button>
                <button
                  onClick={(e) => handleDelete(e, script)}
                  className="p-1.5 text-[#8a8580] hover:text-red-400 transition-colors"
                  title="Delete script"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
