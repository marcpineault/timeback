'use client'

import { useState, useEffect } from 'react'
import { rateScript, type ScriptData } from '@/hooks/useIdeate'

interface Props {
  script: ScriptData
  onBack: () => void
  onScriptUpdated: (script: ScriptData) => void
}

export default function ScriptView({ script, onBack, onScriptUpdated }: Props) {
  const [fullScript, setFullScript] = useState(script.fullScript)
  const [headlineClean, setHeadlineClean] = useState(script.headlineClean || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [currentRating, setCurrentRating] = useState<string | null>(script.rating)
  const [showSpcl, setShowSpcl] = useState(false)

  useEffect(() => {
    setFullScript(script.fullScript)
    setHeadlineClean(script.headlineClean || '')
    setCurrentRating(script.rating)
  }, [script])

  const wordCount = fullScript.split(/\s+/).filter(Boolean).length
  const estimatedDuration = Math.round((wordCount / 150) * 60)

  const hasChanges = fullScript !== script.fullScript || headlineClean !== (script.headlineClean || '')

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/ideate/scripts/${script.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullScript,
          ...(headlineClean !== (script.headlineClean || '') ? { headlineClean } : {}),
        }),
      })

      if (res.ok) {
        const data = await res.json()
        onScriptUpdated(data.script)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } catch (err) {
      console.error('Failed to save script:', err)
    } finally {
      setSaving(false)
    }
  }

  async function handleRate(rating: 'up' | 'down') {
    const newRating = currentRating === rating ? null : rating
    setCurrentRating(newRating)
    await rateScript(script.id, newRating)
  }

  const spcl = script.spclBreakdown as { status?: string; power?: string; credibility?: string; likeness?: string } | null

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="text-[#8a8580] hover:text-[#0a0a0a] text-sm transition-colors flex-shrink-0"
          >
            &larr; Back
          </button>
          <h2 className="text-lg font-semibold text-[#0a0a0a] truncate">{script.title}</h2>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Rating */}
          <button
            onClick={() => handleRate('up')}
            className={`p-1.5 rounded-md transition-colors ${
              currentRating === 'up'
                ? 'bg-green-500/20 text-green-400'
                : 'text-[#8a8580] hover:text-green-400'
            }`}
            title="This script was great"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
            </svg>
          </button>
          <button
            onClick={() => handleRate('down')}
            className={`p-1.5 rounded-md transition-colors ${
              currentRating === 'down'
                ? 'bg-red-500/20 text-red-400'
                : 'text-[#8a8580] hover:text-red-400'
            }`}
            title="This script missed the mark"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018c.163 0 .326.02.485.06L17 4m-7 10v2a2 2 0 002 2h.095c.5 0 .905-.405.905-.905 0-.714.211-1.412.608-2.006L17 13V4m-7 10h2m5-6h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap items-center gap-4 sm:gap-6 mb-6">
        <div>
          <span className="text-[#8a8580] text-xs">Words</span>
          <p className="text-[#0a0a0a] font-medium">{wordCount}</p>
        </div>
        <div>
          <span className="text-[#8a8580] text-xs">Duration</span>
          <p className="text-[#0a0a0a] font-medium">~{estimatedDuration}s</p>
        </div>
        <div>
          <span className="text-[#8a8580] text-xs">Version</span>
          <p className="text-[#0a0a0a] font-medium">{script.version}</p>
        </div>
        {script.idea && (
          <div className="min-w-0">
            <span className="text-[#8a8580] text-xs">From idea</span>
            <p className="text-[#8a8580] text-sm truncate">{script.idea.title}</p>
          </div>
        )}
      </div>

      {/* Headline Overlay Preview */}
      {(script.headlineClean || headlineClean) && (
        <div className="mb-6">
          <div className="bg-[#0a0a0a] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <label className="text-[#8a8580] text-xs font-semibold uppercase tracking-wider">Video Headline Overlay</label>
              {script.hookFormulaUsed && (
                <span className="text-[#8a8580] text-[10px] uppercase tracking-wider">{script.hookFormulaUsed}</span>
              )}
            </div>
            <div className="text-center py-3">
              <p className="text-white text-xl font-bold leading-snug">
                {(headlineClean || '').split(/\s+/).map((word, i) => {
                  const normalizedWord = word.toLowerCase().replace(/[^a-z0-9]/g, '')
                  const accentSet = new Set((script.accentWords || []).map((w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, '')))
                  const isAccent = accentSet.has(normalizedWord)
                  return (
                    <span key={i}>
                      {i > 0 && ' '}
                      <span className={isAccent ? 'text-[#e85d26]' : ''}>{word}</span>
                    </span>
                  )
                })}
              </p>
            </div>
            <input
              type="text"
              value={headlineClean}
              onChange={(e) => setHeadlineClean(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-[#333] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#e85d26] focus:border-[#e85d26] mt-2"
              placeholder="Edit headline overlay text..."
            />
            {script.hookStrengthNotes && (
              <p className="text-[#8a8580] text-xs mt-2 italic">{script.hookStrengthNotes}</p>
            )}
          </div>
        </div>
      )}

      {/* Script */}
      <div className="bg-white border border-[#e0dbd4] rounded-2xl p-5 mb-6">
        <textarea
          value={fullScript}
          onChange={(e) => setFullScript(e.target.value)}
          rows={16}
          className="w-full bg-[#f5f0e8] border border-[#e0dbd4] text-[#0a0a0a] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#e85d26] focus:border-[#e85d26] resize-none"
        />
      </div>

      {/* SPCL Breakdown */}
      {spcl && (
        <div className="mb-6">
          <button
            onClick={() => setShowSpcl(!showSpcl)}
            className="text-[#8a8580] hover:text-[#0a0a0a] text-sm transition-colors flex items-center gap-1"
          >
            <span>{showSpcl ? '▼' : '▶'}</span> SPCL Breakdown
          </button>
          {showSpcl && (
            <div className="mt-3 bg-white border border-[#e0dbd4] rounded-2xl p-5 space-y-3">
              {spcl.status && (
                <div>
                  <span className="text-cyan-400 text-xs font-semibold uppercase">Status: </span>
                  <span className="text-[#0a0a0a] text-sm">{spcl.status}</span>
                </div>
              )}
              {spcl.power && (
                <div>
                  <span className="text-[#e85d26] text-xs font-semibold uppercase">Power: </span>
                  <span className="text-[#0a0a0a] text-sm">{spcl.power}</span>
                </div>
              )}
              {spcl.credibility && (
                <div>
                  <span className="text-amber-400 text-xs font-semibold uppercase">Credibility: </span>
                  <span className="text-[#0a0a0a] text-sm">{spcl.credibility}</span>
                </div>
              )}
              {spcl.likeness && (
                <div>
                  <span className="text-green-400 text-xs font-semibold uppercase">Likeness: </span>
                  <span className="text-[#0a0a0a] text-sm">{spcl.likeness}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {hasChanges && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 bg-[#e85d26] hover:bg-[#d14d1a] disabled:opacity-50 text-[#0a0a0a] rounded-full text-sm font-medium transition-colors"
          >
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      )}
    </div>
  )
}
