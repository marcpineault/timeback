'use client'

import { useState } from 'react'
import TopVideoCard from './TopVideoCard'
import { useTopVideos, type TopVideoData } from '@/hooks/useResearch'

interface Props {
  onUseAsIdea: (ideaId: string) => void
  hasInstagram: boolean
}

type SearchMode = 'creator' | 'hashtag'

export default function Research({ onUseAsIdea, hasInstagram }: Props) {
  const [searchMode, setSearchMode] = useState<SearchMode>('creator')
  const [savedOnly, setSavedOnly] = useState(false)
  const { videos, loading, refetch } = useTopVideos({
    saved: savedOnly || undefined,
  })

  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [freshResults, setFreshResults] = useState<TopVideoData[] | null>(null)
  const [searchCreator, setSearchCreator] = useState<{
    username: string;
    followers_count?: number;
    biography?: string;
  } | null>(null)

  async function handleSearch() {
    if (!query.trim()) return
    setSearching(true)
    setError('')
    setFreshResults(null)
    setSearchCreator(null)

    try {
      const endpoint = searchMode === 'creator'
        ? '/api/ideate/research/creator'
        : '/api/ideate/research/hashtag'

      const body = searchMode === 'creator'
        ? { username: query.trim() }
        : { hashtag: query.trim() }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Search failed')
        return
      }

      const data = await res.json()
      setFreshResults(data.videos)
      if (data.search?.creator) {
        setSearchCreator(data.search.creator)
      }
      setQuery('')
      refetch()
    } catch {
      setError('Search failed. Please try again.')
    } finally {
      setSearching(false)
    }
  }

  async function handleUseAsIdea(videoId: string) {
    try {
      const res = await fetch('/api/ideate/research/use', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to create idea')
        return
      }

      const data = await res.json()
      refetch()
      onUseAsIdea(data.idea.id)
    } catch {
      setError('Failed to create idea from research video.')
    }
  }

  // Show either fresh search results or historical results
  const displayVideos = freshResults || videos

  // No Instagram connected — show connect prompt
  if (!hasInstagram) {
    return (
      <div className="bg-white border border-[#e0dbd4] rounded-2xl p-8 sm:p-12 text-center">
        <div className="w-20 h-20 mx-auto mb-6 bg-[rgba(232,93,38,0.08)] rounded-full flex items-center justify-center">
          <svg className="w-10 h-10 text-[#e85d26]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-[#0a0a0a] mb-2" style={{ fontFamily: "'Instrument Serif', serif" }}>
          Connect Instagram to start researching
        </h2>
        <p className="text-[#8a8580] text-sm mb-6 max-w-md mx-auto">
          Research uses your connected Instagram account to discover top-performing videos from creators
          in your niche. Connect your Instagram Business or Creator account to get started.
        </p>
        <a
          href="/dashboard?tab=schedule"
          className="inline-flex px-6 py-2.5 bg-[#e85d26] hover:bg-[#d14d1a] text-[#0a0a0a] rounded-full text-sm font-medium transition-colors"
        >
          Connect Instagram
        </a>
      </div>
    )
  }

  return (
    <div>
      {/* Search Area */}
      <div className="bg-white border border-[#e0dbd4] rounded-2xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-[#0a0a0a] mb-1">Research Top-Performing Videos</h2>
        <p className="text-[#8a8580] text-sm mb-4">
          Find what&apos;s working for top creators in your niche. We&apos;ll analyze their hooks and adapt them for your content.
        </p>

        {/* Search mode toggle */}
        <div className="flex gap-1 bg-[#f5f0e8] rounded-full p-1 w-fit mb-4">
          <button
            onClick={() => { setSearchMode('creator'); setFreshResults(null); setSearchCreator(null); }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              searchMode === 'creator'
                ? 'bg-white text-[#0a0a0a] shadow-sm'
                : 'text-[#8a8580] hover:text-[#0a0a0a]'
            }`}
          >
            Creator
          </button>
          <button
            onClick={() => { setSearchMode('hashtag'); setFreshResults(null); setSearchCreator(null); }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              searchMode === 'hashtag'
                ? 'bg-white text-[#0a0a0a] shadow-sm'
                : 'text-[#8a8580] hover:text-[#0a0a0a]'
            }`}
          >
            Hashtag
          </button>
        </div>

        {/* Search input */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8a8580] text-sm">
              {searchMode === 'creator' ? '@' : '#'}
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchMode === 'creator' ? 'Enter Instagram handle' : 'Enter hashtag'}
              className="w-full bg-[#f5f0e8] border border-[#e0dbd4] text-[#0a0a0a] rounded-full pl-8 pr-4 py-3 text-sm placeholder-[#8a8580] focus:outline-none focus:border-[#e85d26]"
              onKeyDown={(e) => e.key === 'Enter' && !searching && handleSearch()}
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={searching || !query.trim()}
            className="px-6 py-3 bg-[#e85d26] hover:bg-[#d14d1a] disabled:opacity-50 text-[#0a0a0a] rounded-full text-sm font-medium transition-colors whitespace-nowrap"
          >
            {searching ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Analyzing...
              </span>
            ) : (
              searchMode === 'creator' ? 'Analyze Creator' : 'Search Hashtag'
            )}
          </button>
        </div>

        {searchMode === 'hashtag' && (
          <p className="text-[#8a8580] text-xs mt-2">
            Note: Instagram limits hashtag searches to 30 unique hashtags per 7 days.
          </p>
        )}

        {error && (
          <p className="text-red-500 text-sm mt-3">{error}</p>
        )}
      </div>

      {/* Creator info banner (when showing creator search results) */}
      {searchCreator && freshResults && (
        <div className="bg-white border border-[#e0dbd4] rounded-2xl p-4 mb-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-[#f5f0e8] rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-[#e85d26] font-semibold text-sm">
              {searchCreator.username.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[#0a0a0a]">@{searchCreator.username}</p>
            {searchCreator.followers_count && (
              <p className="text-xs text-[#8a8580]">
                {searchCreator.followers_count.toLocaleString()} followers
              </p>
            )}
          </div>
          <span className="text-xs text-[#8a8580] flex-shrink-0">
            {freshResults.length} top video{freshResults.length !== 1 ? 's' : ''} analyzed
          </span>
        </div>
      )}

      {/* Filter Bar */}
      {!freshResults && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-[#8a8580] text-sm">Filter:</span>
          <button
            onClick={() => setSavedOnly(false)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              !savedOnly
                ? 'bg-[rgba(232,93,38,0.1)] text-[#e85d26]'
                : 'bg-[#f5f0e8] text-[#8a8580] hover:text-[#0a0a0a]'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setSavedOnly(true)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              savedOnly
                ? 'bg-amber-500/20 text-amber-500'
                : 'bg-[#f5f0e8] text-[#8a8580] hover:text-[#0a0a0a]'
            }`}
          >
            Saved
          </button>
          {freshResults && (
            <button
              onClick={() => { setFreshResults(null); setSearchCreator(null); }}
              className="px-3 py-1 rounded-full text-xs font-medium bg-[#f5f0e8] text-[#8a8580] hover:text-[#0a0a0a] transition-colors"
            >
              Show all results
            </button>
          )}
        </div>
      )}

      {/* Back to all results button when showing fresh results */}
      {freshResults && (
        <div className="mb-4">
          <button
            onClick={() => { setFreshResults(null); setSearchCreator(null); }}
            className="text-[#8a8580] hover:text-[#0a0a0a] text-sm transition-colors flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to all research
          </button>
        </div>
      )}

      {/* Results Grid */}
      {loading && !freshResults ? (
        <div className="text-[#8a8580] text-center py-12">Loading research...</div>
      ) : displayVideos.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 bg-[rgba(232,93,38,0.08)] rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-[#e85d26]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <p className="text-[#8a8580] mb-2">
            {savedOnly ? 'No saved research yet' : 'No research yet'}
          </p>
          <p className="text-[#8a8580] text-sm">
            {savedOnly
              ? 'Save your favorite findings using the bookmark icon.'
              : 'Search for a creator or hashtag above to discover top-performing videos in your niche.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {displayVideos.map((video) => (
            <TopVideoCard
              key={video.id}
              video={video}
              onUseAsIdea={handleUseAsIdea}
              onRefresh={refetch}
            />
          ))}
        </div>
      )}
    </div>
  )
}
