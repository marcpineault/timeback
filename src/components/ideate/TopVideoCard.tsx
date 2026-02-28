'use client'

import { useState } from 'react'
import { toggleTopVideoSave, type TopVideoData } from '@/hooks/useResearch'

interface Props {
  video: TopVideoData
  onUseAsIdea: (videoId: string) => void
  onRefresh: () => void
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n.toString()
}

export default function TopVideoCard({ video, onUseAsIdea, onRefresh }: Props) {
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [showAdapted, setShowAdapted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  async function handleToggleSave() {
    setSaving(true)
    const success = await toggleTopVideoSave(video.id, !video.isSaved)
    if (success) onRefresh()
    setSaving(false)
  }

  function handleCopy(text: string, label: string) {
    navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(null), 2000)
  }

  const totalEngagement = video.likeCount + video.commentsCount

  return (
    <div className="bg-white border border-[#e0dbd4] rounded-2xl p-5 flex flex-col">
      {/* Header: creator info + engagement + save */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          {video.creatorUsername && (
            <a
              href={video.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-[#0a0a0a] hover:text-[#e85d26] transition-colors truncate"
            >
              @{video.creatorUsername}
            </a>
          )}
          {video.creatorFollowers && (
            <span className="text-[#8a8580] text-xs flex-shrink-0">
              {formatNumber(video.creatorFollowers)} followers
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <a
            href={video.permalink}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 text-[#8a8580] hover:text-[#e85d26] transition-colors"
            title="View on Instagram"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
          <button
            onClick={handleToggleSave}
            disabled={saving}
            className={`p-1.5 rounded transition-colors ${
              video.isSaved
                ? 'text-amber-400 hover:text-amber-300'
                : 'text-[#8a8580] hover:text-amber-400'
            }`}
            title={video.isSaved ? 'Unsave' : 'Save'}
          >
            <svg className="w-4 h-4" fill={video.isSaved ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Engagement metrics */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center gap-1 text-xs text-[#8a8580]">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
          {formatNumber(video.likeCount)}
        </div>
        <div className="flex items-center gap-1 text-xs text-[#8a8580]">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          {formatNumber(video.commentsCount)}
        </div>
        <span className="text-xs text-[#8a8580]">
          {formatNumber(totalEngagement)} total
        </span>
      </div>

      {/* Hook strength bar + formula label */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-500/20 text-cyan-600">
            {video.hookFormula}
          </span>
          <span className="text-xs text-[#8a8580]">
            Hook strength: {video.hookStrength}/10
          </span>
        </div>
        <div className="w-full bg-[#e0dbd4] rounded-full h-1.5">
          <div
            className="h-1.5 rounded-full transition-all"
            style={{
              width: `${video.hookStrength * 10}%`,
              backgroundColor: video.hookStrength >= 8 ? '#22c55e' : video.hookStrength >= 5 ? '#e85d26' : '#8a8580',
            }}
          />
        </div>
      </div>

      {/* Extracted hook */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-cyan-600 text-xs font-semibold uppercase">Original Hook</span>
          <button
            onClick={() => handleCopy(video.hook, 'hook')}
            className="text-[#8a8580] hover:text-[#e85d26] text-xs transition-colors"
          >
            {copied === 'hook' ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <p className="text-[#0a0a0a] text-sm">{video.hook}</p>
      </div>

      {/* Content structure */}
      <div className="mb-3">
        <span className="text-[#8a8580] text-xs font-semibold uppercase">Structure</span>
        <p className="text-[#0a0a0a] text-sm mt-0.5">{video.contentStructure}</p>
      </div>

      {/* Why this works (expandable) */}
      <div className="border-t border-[#e0dbd4] pt-3 mb-3">
        <button
          onClick={() => setShowAnalysis(!showAnalysis)}
          className="text-[#8a8580] hover:text-[#0a0a0a] text-xs transition-colors flex items-center gap-1"
        >
          <span>{showAnalysis ? '\u25BC' : '\u25B6'}</span> Why this works
        </button>
        {showAnalysis && (
          <div className="mt-2 space-y-2">
            <p className="text-[#8a8580] text-xs leading-relaxed">{video.whyItWorks}</p>
            <div className="flex flex-wrap gap-1">
              <span className="px-2 py-0.5 bg-[rgba(232,93,38,0.1)] text-[#e85d26] rounded-full text-xs">
                {video.viralPattern}
              </span>
              <span className="px-2 py-0.5 bg-purple-500/10 text-purple-600 rounded-full text-xs">
                {video.targetEmotion}
              </span>
              <span className="px-2 py-0.5 bg-green-500/10 text-green-600 rounded-full text-xs">
                {video.engagementDriver}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Adapted hooks for you (expandable) */}
      <div className="border-t border-[#e0dbd4] pt-3">
        <button
          onClick={() => setShowAdapted(!showAdapted)}
          className="text-[#e85d26] hover:text-[#d14d1a] text-xs font-medium transition-colors flex items-center gap-1"
        >
          <span>{showAdapted ? '\u25BC' : '\u25B6'}</span> Adapted hooks for you
        </button>
        {showAdapted && (
          <div className="mt-2 space-y-2">
            {/* Main adapted hook */}
            <div className="bg-[#f5f0e8] rounded-xl p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[#e85d26] text-xs font-semibold">Your Hook</span>
                <button
                  onClick={() => handleCopy(video.adaptedHook, 'adapted')}
                  className="text-[#8a8580] hover:text-[#e85d26] text-xs transition-colors"
                >
                  {copied === 'adapted' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-[#0a0a0a] text-sm font-medium">{video.adaptedHook}</p>
            </div>

            {/* Variations */}
            {video.adaptedHookVariations.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[#8a8580] text-xs">Variations:</span>
                {video.adaptedHookVariations.map((v, i) => (
                  <div key={i} className="flex items-start gap-2 group">
                    <p className="text-[#0a0a0a] text-xs flex-1">{v}</p>
                    <button
                      onClick={() => handleCopy(v, `var-${i}`)}
                      className="text-[#8a8580] hover:text-[#e85d26] text-xs opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    >
                      {copied === `var-${i}` ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Adaptation notes */}
            {video.adaptationNotes && (
              <p className="text-[#8a8580] text-xs italic">{video.adaptationNotes}</p>
            )}
          </div>
        )}
      </div>

      {/* Tags */}
      {video.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {video.tags.map((tag) => (
            <span key={tag} className="px-2 py-0.5 bg-[#f5f0e8] text-[#8a8580] rounded-full text-xs">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Use as idea button */}
      <button
        onClick={() => onUseAsIdea(video.id)}
        disabled={video.isUsedAsIdea}
        className={`mt-4 w-full px-4 py-2 rounded-full text-sm font-medium transition-colors ${
          video.isUsedAsIdea
            ? 'bg-[#e0dbd4] text-[#8a8580] cursor-not-allowed'
            : 'bg-[#e85d26] hover:bg-[#d14d1a] text-[#0a0a0a]'
        }`}
      >
        {video.isUsedAsIdea ? 'Used as Idea' : 'Use as Idea'}
      </button>
    </div>
  )
}
