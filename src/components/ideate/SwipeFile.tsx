'use client'

import { useState } from 'react'
import SwipeEntryCard from './SwipeEntryCard'
import { useSwipeEntries } from '@/hooks/useSwipeFile'

interface Props {
  onUseAsIdea: (ideaId: string) => void
}

type CategoryFilter = '' | 'HOOK' | 'MEAT' | 'CTA' | 'FULL'

export default function SwipeFile({ onUseAsIdea }: Props) {
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('')
  const [savedOnly, setSavedOnly] = useState(false)
  const { entries, loading, refetch } = useSwipeEntries({
    category: categoryFilter || undefined,
    saved: savedOnly || undefined,
  })

  const [topic, setTopic] = useState('')
  const [genCategory, setGenCategory] = useState<CategoryFilter>('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  async function handleGenerate() {
    setGenerating(true)
    setError('')

    try {
      const res = await fetch('/api/ideate/swipefile/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim() || undefined,
          category: genCategory || undefined,
          count: 5,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to generate swipe entries')
        return
      }

      setTopic('')
      refetch()
    } catch {
      setError('Failed to generate swipe entries. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  async function handleUseAsIdea(entryId: string) {
    try {
      const res = await fetch('/api/ideate/swipefile/use', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to create idea')
        return
      }

      const data = await res.json()
      onUseAsIdea(data.idea.id)
    } catch {
      setError('Failed to create idea from swipe entry.')
    }
  }

  return (
    <div>
      {/* Generation Area */}
      <div className="bg-white border border-[#e0dbd4] rounded-2xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-[#0a0a0a] mb-1">Get Inspiration from Other Creators</h2>
        <p className="text-[#8a8580] text-sm mb-4">
          See what&apos;s working for top creators in your niche. AI generates proven hooks, structures, and CTAs you can adapt.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Optional: focus on a topic (e.g. objection handling, case studies)"
            className="flex-1 bg-[#f5f0e8] border border-[#e0dbd4] text-[#0a0a0a] rounded-full px-4 py-3 text-sm placeholder-[#8a8580] focus:outline-none focus:border-[#e85d26]"
            onKeyDown={(e) => e.key === 'Enter' && !generating && handleGenerate()}
          />
          <select
            value={genCategory}
            onChange={(e) => setGenCategory(e.target.value as CategoryFilter)}
            className="bg-[#f5f0e8] border border-[#e0dbd4] text-[#0a0a0a] rounded-full px-4 py-3 text-sm focus:outline-none focus:border-[#e85d26]"
          >
            <option value="">All Types</option>
            <option value="HOOK">Hooks</option>
            <option value="MEAT">Body/Meat</option>
            <option value="CTA">CTAs</option>
            <option value="FULL">Full Scripts</option>
          </select>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-6 py-3 bg-[#e85d26] hover:bg-[#d14d1a] disabled:opacity-50 text-[#0a0a0a] rounded-full text-sm font-medium transition-colors whitespace-nowrap"
          >
            {generating ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Finding Inspiration...
              </span>
            ) : (
              'Get Inspired'
            )}
          </button>
        </div>

        {error && (
          <p className="text-red-400 text-sm mt-3">{error}</p>
        )}
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-[#8a8580] text-sm">Filter:</span>
        {(['', 'HOOK', 'MEAT', 'CTA', 'FULL'] as CategoryFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setCategoryFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              categoryFilter === f
                ? 'bg-[rgba(232,93,38,0.1)] text-[#e85d26]'
                : 'bg-[#f5f0e8] text-[#8a8580] hover:text-[#0a0a0a]'
            }`}
          >
            {f || 'All'}
          </button>
        ))}
        <div className="w-px h-4 bg-[#e0dbd4] mx-1" />
        <button
          onClick={() => setSavedOnly(!savedOnly)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            savedOnly
              ? 'bg-amber-500/20 text-amber-400'
              : 'bg-[#f5f0e8] text-[#8a8580] hover:text-[#0a0a0a]'
          }`}
        >
          Saved
        </button>
      </div>

      {/* Entries Grid */}
      {loading ? (
        <div className="text-[#8a8580] text-center py-12">Loading inspiration...</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-[#8a8580] mb-2">
            {savedOnly ? 'No saved entries yet' : 'No inspiration entries yet'}
          </p>
          <p className="text-[#8a8580] text-sm">
            {savedOnly
              ? 'Save your favorite patterns using the bookmark icon.'
              : 'Click "Get Inspired" above to discover proven content patterns in your niche.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {entries.map((entry) => (
            <SwipeEntryCard
              key={entry.id}
              entry={entry}
              onUseAsIdea={handleUseAsIdea}
              onRefresh={refetch}
            />
          ))}
        </div>
      )}
    </div>
  )
}
