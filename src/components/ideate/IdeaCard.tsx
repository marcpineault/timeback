'use client'

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
  SCRIPTED: 'bg-violet-500/20 text-violet-400',
  FILMED: 'bg-green-500/20 text-green-400',
  ARCHIVED: 'bg-gray-500/20 text-gray-500',
}

export default function IdeaCard({ idea, onWriteScript, onArchive, isGenerating }: Props) {
  return (
    <div className="bg-[#2A2A3A] rounded-lg p-4 hover:bg-[#2F2F40] transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-white font-medium text-sm leading-tight">{idea.title}</h3>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${STATUS_COLORS[idea.status] || STATUS_COLORS.SAVED}`}>
          {idea.status}
        </span>
      </div>

      <p className="text-cyan-400 text-sm italic mb-2">&ldquo;{idea.hook}&rdquo;</p>

      <p className="text-gray-400 text-xs mb-3 line-clamp-2">{idea.angle}</p>

      <div className="flex items-center gap-2 mb-3">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${EMOTION_COLORS[idea.targetEmotion] || 'bg-gray-500/20 text-gray-400'}`}>
          {idea.targetEmotion}
        </span>
        <span className="text-gray-500 text-xs">{idea.estimatedLength}s</span>
      </div>

      {/* SPCL indicators */}
      <div className="flex gap-1.5 mb-3">
        {idea.spclElements?.status && (
          <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-[10px] font-bold" title={`Status: ${idea.spclElements.status}`}>S</span>
        )}
        {idea.spclElements?.power && (
          <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center text-[10px] font-bold" title={`Power: ${idea.spclElements.power}`}>P</span>
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
              className="flex-1 px-3 py-1.5 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 disabled:opacity-50 text-white rounded-md text-xs font-medium transition-colors"
            >
              {isGenerating ? 'Writing...' : idea.status === 'SCRIPTED' ? 'Rewrite Script' : 'Write Script'}
            </button>
            <button
              onClick={() => onArchive(idea)}
              className="px-3 py-1.5 text-gray-500 hover:text-gray-300 text-xs transition-colors"
            >
              Archive
            </button>
          </>
        )}
      </div>
    </div>
  )
}
