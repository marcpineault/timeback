'use client'

import { useState } from 'react'
import { toggleSwipeSave, type SwipeEntryData } from '@/hooks/useSwipeFile'

interface Props {
  entry: SwipeEntryData
  onUseAsIdea: (entryId: string) => void
  onRefresh: () => void
}

const CATEGORY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  HOOK: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', label: 'Hook' },
  MEAT: { bg: 'bg-[rgba(232,93,38,0.1)]', text: 'text-[#e85d26]', label: 'Meat' },
  CTA: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'CTA' },
  FULL: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'Full' },
}

export default function SwipeEntryCard({ entry, onUseAsIdea, onRefresh }: Props) {
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const cat = CATEGORY_STYLES[entry.category] || CATEGORY_STYLES.FULL

  async function handleToggleSave() {
    setSaving(true)
    const success = await toggleSwipeSave(entry.id, !entry.isSaved)
    if (success) onRefresh()
    setSaving(false)
  }

  async function handleDelete() {
    if (!confirm('Delete this entry?')) return
    setDeleting(true)
    try {
      await fetch(`/api/ideate/swipefile/${entry.id}`, { method: 'DELETE' })
      onRefresh()
    } catch {
      console.error('Failed to delete swipe entry')
    }
    setDeleting(false)
  }

  return (
    <div className="bg-white border border-[#e0dbd4] rounded-2xl p-5 flex flex-col">
      {/* Header: category + format + save */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cat.bg} ${cat.text}`}>
            {cat.label}
          </span>
          <span className="text-[#8a8580] text-xs">{entry.format}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleToggleSave}
            disabled={saving}
            className={`p-1.5 rounded transition-colors ${
              entry.isSaved
                ? 'text-amber-400 hover:text-amber-300'
                : 'text-[#8a8580] hover:text-amber-400'
            }`}
            title={entry.isSaved ? 'Unsave' : 'Save'}
          >
            <svg className="w-4 h-4" fill={entry.isSaved ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-1.5 text-[#8a8580] hover:text-red-400 transition-colors"
            title="Delete"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Source line */}
      <p className="text-[#8a8580] text-xs italic mb-3">{entry.source}</p>

      {/* Content sections */}
      <div className="space-y-3 flex-1">
        <div>
          <span className="text-cyan-400 text-xs font-semibold uppercase">Hook</span>
          <p className="text-[#0a0a0a] text-sm mt-0.5">{entry.hook}</p>
        </div>
        <div>
          <span className="text-[#e85d26] text-xs font-semibold uppercase">Meat</span>
          <p className="text-[#0a0a0a] text-sm mt-0.5 line-clamp-4">{entry.meat}</p>
        </div>
        <div>
          <span className="text-green-400 text-xs font-semibold uppercase">CTA</span>
          <p className="text-[#0a0a0a] text-sm mt-0.5">{entry.cta}</p>
        </div>
      </div>

      {/* Why this works (expandable) */}
      <div className="mt-3 pt-3 border-t border-[#e0dbd4]">
        <button
          onClick={() => setShowAnalysis(!showAnalysis)}
          className="text-[#8a8580] hover:text-[#0a0a0a] text-xs transition-colors flex items-center gap-1"
        >
          <span>{showAnalysis ? '\u25BC' : '\u25B6'}</span> Why this works
        </button>
        {showAnalysis && (
          <p className="text-[#8a8580] text-xs mt-2 leading-relaxed">{entry.analysis}</p>
        )}
      </div>

      {/* Tags */}
      {entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {entry.tags.map((tag) => (
            <span key={tag} className="px-2 py-0.5 bg-[#f5f0e8] text-[#8a8580] rounded-full text-xs">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Use as idea button */}
      <button
        onClick={() => onUseAsIdea(entry.id)}
        className="mt-4 w-full px-4 py-2 bg-[#e85d26] hover:bg-[#d14d1a] text-[#0a0a0a] rounded-full text-sm font-medium transition-colors"
      >
        Use as Idea
      </button>
    </div>
  )
}
