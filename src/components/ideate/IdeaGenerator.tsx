'use client'

import { useState } from 'react'
import IdeaCard from './IdeaCard'
import { useIdeas, type IdeaData, type ScriptData } from '@/hooks/useIdeate'

interface Props {
  onScriptGenerated: (script: ScriptData) => void
}

type StatusFilter = '' | 'SAVED' | 'SCRIPTED' | 'FILMED' | 'ARCHIVED'

export default function IdeaGenerator({ onScriptGenerated }: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')
  const { ideas, loading, refetch } = useIdeas(statusFilter || undefined)
  const [topic, setTopic] = useState('')
  const [count, setCount] = useState(5)
  const [contentStyle, setContentStyle] = useState('auto')
  const [generating, setGenerating] = useState(false)
  const [generatingScriptId, setGeneratingScriptId] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function handleGenerate() {
    setGenerating(true)
    setError('')

    try {
      const res = await fetch('/api/ideate/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim() || undefined, count, contentStyle: contentStyle !== 'auto' ? contentStyle : undefined }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to generate ideas')
        return
      }

      setTopic('')
      refetch()
    } catch {
      setError('Failed to generate ideas. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  async function handleWriteScript(idea: IdeaData) {
    setGeneratingScriptId(idea.id)
    setError('')

    try {
      const res = await fetch('/api/ideate/scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ideaId: idea.id }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to generate script')
        return
      }

      const data = await res.json()
      refetch()
      onScriptGenerated(data.script)
    } catch {
      setError('Failed to generate script. Please try again.')
    } finally {
      setGeneratingScriptId(null)
    }
  }

  async function handleArchive(idea: IdeaData) {
    try {
      await fetch(`/api/ideate/ideas/${idea.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ARCHIVED' }),
      })
      refetch()
    } catch {
      console.error('Failed to archive idea')
    }
  }

  return (
    <div>
      {/* Generation Area */}
      <div className="bg-[#1A1A24] rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-1">Generate Video Ideas</h2>
        <p className="text-gray-500 text-sm mb-4">
          AI creates ideas tailored to your profile. Pick a style, or let AI choose for you.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Optional: focus on a topic (e.g. cold outreach, pricing strategy)"
            className="flex-1 bg-[#2A2A3A] border border-gray-700 text-white rounded-lg px-4 py-3 text-sm placeholder-gray-500 focus:outline-none focus:border-violet-500"
            onKeyDown={(e) => e.key === 'Enter' && !generating && handleGenerate()}
          />
          <select
            value={count}
            onChange={(e) => setCount(parseInt(e.target.value))}
            className="bg-[#2A2A3A] border border-gray-700 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-violet-500 w-20"
          >
            <option value={3}>3</option>
            <option value={5}>5</option>
            <option value={10}>10</option>
          </select>
          <select
            value={contentStyle}
            onChange={(e) => setContentStyle(e.target.value)}
            className="bg-[#2A2A3A] border border-gray-700 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-violet-500"
          >
            <option value="auto">Any Style</option>
            <option value="hook-story-lesson">Story + Lesson</option>
            <option value="contrarian-take">Contrarian Take</option>
            <option value="step-by-step">How-To / Steps</option>
            <option value="before-after">Before & After</option>
            <option value="myth-buster">Myth Buster</option>
          </select>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
          >
            {generating ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Generating...
              </span>
            ) : (
              'Generate Ideas'
            )}
          </button>
        </div>

        {error && (
          <p className="text-red-400 text-sm mt-3">{error}</p>
        )}
      </div>

      {/* Filter + Ideas Grid */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-gray-500 text-sm">Filter:</span>
        {(['', 'SAVED', 'SCRIPTED', 'FILMED', 'ARCHIVED'] as StatusFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              statusFilter === f
                ? 'bg-violet-500/20 text-violet-400'
                : 'bg-[#2A2A3A] text-gray-400 hover:text-white'
            }`}
          >
            {f || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-500 text-center py-12">Loading ideas...</div>
      ) : ideas.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400 mb-2">No ideas yet</p>
          <p className="text-gray-500 text-sm">Generate your first batch of video ideas above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ideas.map((idea) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              onWriteScript={handleWriteScript}
              onArchive={handleArchive}
              isGenerating={generatingScriptId === idea.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}
