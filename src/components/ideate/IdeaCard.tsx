'use client'

import { useState } from 'react'
import type { IdeaData } from '@/hooks/useIdeate'

interface Props {
  idea: IdeaData
  onWriteScript: (idea: IdeaData) => void
  onArchive: (idea: IdeaData) => void
  isGenerating?: boolean
}

const EMOTION_COLORS: Record<string, string> = {
  curiosity: 'bg-blue-500/20 text-blue-400',
  FOMO: 'bg-red-500/20 text-red-400',
  aspiration: 'bg-green-500/20 text-green-400',
  anger: 'bg-orange-500/20 text-orange-400',
  relief: 'bg-teal-500/20 text-teal-400',
  surprise: 'bg-purple-500/20 text-purple-400',
}

const STATUS_COLORS: Record<string, string> = {
  SAVED: 'bg-gray-500/20 text-gray-400',
  SCRIPTED: 'bg-[rgba(232,93,38,0.1)] text-[#e85d26]',
  FILMED: 'bg-green-500/20 text-green-400',
  ARCHIVED: 'bg-gray-500/20 text-gray-500',
}

const CONTENT_TYPE_COLORS: Record<string, string> = {
  reach: 'bg-blue-500/20 text-blue-400',
  authority: 'bg-amber-500/20 text-amber-400',
  conversion: 'bg-green-500/20 text-green-400',
}

const ENGAGEMENT_ICONS: Record<string, string> = {
  saves: 'Saves',
  shares: 'Shares',
  comments: 'Comments',
  follows: 'Follows',
}

export default function IdeaCard({ idea, onWriteScript, onArchive, isGenerating }: Props) {
  const [showHookVariations, setShowHookVariations] = useState(false)

  return (
    <div className="bg-[#f5f0e8] rounded-full p-4 hover:bg-[#e0dbd4] transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-[#0a0a0a] font-medium text-sm leading-tight">{idea.title}</h3>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${STATUS_COLORS[idea.status] || STATUS_COLORS.SAVED}`}>
          {idea.status}
        </span>
      </div>

      <p className="text-[#e85d26] text-sm italic mb-2">&ldquo;{idea.hook}&rdquo;</p>

      {/* Hook Variations */}
      {idea.hookVariations && idea.hookVariations.length > 0 && (
        <div className="mb-2">
          <button
            onClick={() => setShowHookVariations(!showHookVariations)}
            className="text-[#8a8580] hover:text-[#0a0a0a] text-[10px] uppercase tracking-wider transition-colors"
          >
            {showHookVariations ? 'Hide' : 'Show'} hook variations ({idea.hookVariations.length})
          </button>
          {showHookVariations && (
            <div className="mt-1.5 space-y-1">
              {idea.hookVariations.map((variation, i) => (
                <p key={i} className="text-[#8a8580] text-xs italic pl-2 border-l border-[#e0dbd4]">
                  &ldquo;{variation}&rdquo;
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="text-[#8a8580] text-xs mb-3 line-clamp-2">{idea.angle}</p>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {/* Content Type Badge */}
        {idea.contentType && (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CONTENT_TYPE_COLORS[idea.contentType] || 'bg-gray-500/20 text-gray-400'}`}>
            {idea.contentType}
          </span>
        )}
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${EMOTION_COLORS[idea.targetEmotion] || 'bg-gray-500/20 text-gray-400'}`}>
          {idea.targetEmotion}
        </span>
        {/* Engagement Play */}
        {idea.engagementPlay && (
          <span className="text-[#8a8580] text-xs">
            {ENGAGEMENT_ICONS[idea.engagementPlay] || idea.engagementPlay}
          </span>
        )}
        <span className="text-[#8a8580] text-xs">{idea.estimatedLength}s</span>
      </div>

      {/* SPCL indicators */}
      <div className="flex gap-1.5 mb-3">
        {idea.spclElements?.status && (
          <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-[10px] font-bold" title={`Status: ${idea.spclElements.status}`}>S</span>
        )}
        {idea.spclElements?.power && (
          <span className="w-5 h-5 rounded-full bg-[rgba(232,93,38,0.1)] text-[#e85d26] flex items-center justify-center text-[10px] font-bold" title={`Power: ${idea.spclElements.power}`}>P</span>
        )}
        {idea.spclElements?.credibility && (
          <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] font-bold" title={`Credibility: ${idea.spclElements.credibility}`}>C</span>
        )}
        {idea.spclElements?.likeness && (
          <span className="w-5 h-5 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-[10px] font-bold" title={`Likeness: ${idea.spclElements.likeness}`}>L</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {idea.status !== 'ARCHIVED' && (
          <>
            <button
              onClick={() => onWriteScript(idea)}
              disabled={isGenerating}
              className="flex-1 px-3 py-1.5 bg-[#e85d26] hover:bg-[#d14d1a] disabled:opacity-50 text-[#0a0a0a] rounded-md text-xs font-medium transition-colors"
            >
              {isGenerating ? 'Writing...' : idea.status === 'SCRIPTED' ? 'Rewrite Script' : 'Write Script'}
            </button>
            <button
              onClick={() => onArchive(idea)}
              className="px-3 py-1.5 text-[#8a8580] hover:text-[#0a0a0a] text-xs transition-colors"
            >
              Archive
            </button>
          </>
        )}
      </div>
    </div>
  )
}
