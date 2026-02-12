'use client'

import { useState, useEffect } from 'react'
import { rateScript, type ScriptData } from '@/hooks/useIdeate'

interface Props {
  script: ScriptData
  onBack: () => void
  onOpenTeleprompter: (script: ScriptData) => void
  onScriptUpdated: (script: ScriptData) => void
}

export default function ScriptView({ script, onBack, onOpenTeleprompter, onScriptUpdated }: Props) {
  const [hook, setHook] = useState(script.hook)
  const [body, setBody] = useState(script.body)
  const [cta, setCta] = useState(script.cta)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [currentRating, setCurrentRating] = useState<string | null>(script.rating)
  const [showSpcl, setShowSpcl] = useState(false)

  useEffect(() => {
    setHook(script.hook)
    setBody(script.body)
    setCta(script.cta)
    setCurrentRating(script.rating)
  }, [script])

  const fullText = `${hook}\n\n${body}\n\n${cta}`
  const wordCount = fullText.replace(/\[PAUSE\]/g, '').split(/\s+/).filter(Boolean).length
  const estimatedDuration = Math.round((wordCount / 150) * 60)

  const hasChanges = hook !== script.hook || body !== script.body || cta !== script.cta

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/ideate/scripts/${script.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hook, body, cta, fullScript: fullText }),
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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-gray-400 hover:text-white text-sm transition-colors"
          >
            &larr; Back
          </button>
          <h2 className="text-lg font-semibold text-white">{script.title}</h2>
        </div>

        <div className="flex items-center gap-2">
          {/* Rating */}
          <button
            onClick={() => handleRate('up')}
            className={`p-1.5 rounded-md transition-colors ${
              currentRating === 'up'
                ? 'bg-green-500/20 text-green-400'
                : 'text-gray-500 hover:text-green-400'
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
                : 'text-gray-500 hover:text-red-400'
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
      <div className="flex items-center gap-6 mb-6">
        <div>
          <span className="text-gray-500 text-xs">Words</span>
          <p className="text-white font-medium">{wordCount}</p>
        </div>
        <div>
          <span className="text-gray-500 text-xs">Duration</span>
          <p className="text-white font-medium">~{estimatedDuration}s</p>
        </div>
        <div>
          <span className="text-gray-500 text-xs">Version</span>
          <p className="text-white font-medium">{script.version}</p>
        </div>
        {script.idea && (
          <div>
            <span className="text-gray-500 text-xs">From idea</span>
            <p className="text-gray-400 text-sm">{script.idea.title}</p>
          </div>
        )}
      </div>

      {/* Script Sections */}
      <div className="space-y-4 mb-6">
        <div className="bg-[#1A1A24] rounded-xl p-5">
          <label className="block text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-2">Hook</label>
          <textarea
            value={hook}
            onChange={(e) => setHook(e.target.value)}
            rows={2}
            className="w-full bg-[#2A2A3A] border border-gray-700 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cyan-500 resize-none"
          />
        </div>

        <div className="bg-[#1A1A24] rounded-xl p-5">
          <label className="block text-violet-400 text-xs font-semibold uppercase tracking-wider mb-2">Body</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            className="w-full bg-[#2A2A3A] border border-gray-700 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-violet-500 resize-none"
          />
        </div>

        <div className="bg-[#1A1A24] rounded-xl p-5">
          <label className="block text-green-400 text-xs font-semibold uppercase tracking-wider mb-2">Call to Action</label>
          <textarea
            value={cta}
            onChange={(e) => setCta(e.target.value)}
            rows={2}
            className="w-full bg-[#2A2A3A] border border-gray-700 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-green-500 resize-none"
          />
        </div>
      </div>

      {/* SPCL Breakdown */}
      {spcl && (
        <div className="mb-6">
          <button
            onClick={() => setShowSpcl(!showSpcl)}
            className="text-gray-400 hover:text-white text-sm transition-colors flex items-center gap-1"
          >
            <span>{showSpcl ? '▼' : '▶'}</span> SPCL Breakdown
          </button>
          {showSpcl && (
            <div className="mt-3 bg-[#1A1A24] rounded-xl p-5 space-y-3">
              {spcl.status && (
                <div>
                  <span className="text-cyan-400 text-xs font-semibold uppercase">Status: </span>
                  <span className="text-gray-300 text-sm">{spcl.status}</span>
                </div>
              )}
              {spcl.power && (
                <div>
                  <span className="text-violet-400 text-xs font-semibold uppercase">Power: </span>
                  <span className="text-gray-300 text-sm">{spcl.power}</span>
                </div>
              )}
              {spcl.credibility && (
                <div>
                  <span className="text-amber-400 text-xs font-semibold uppercase">Credibility: </span>
                  <span className="text-gray-300 text-sm">{spcl.credibility}</span>
                </div>
              )}
              {spcl.likeness && (
                <div>
                  <span className="text-green-400 text-xs font-semibold uppercase">Likeness: </span>
                  <span className="text-gray-300 text-sm">{spcl.likeness}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        {hasChanges && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
          </button>
        )}
        <button
          onClick={() => onOpenTeleprompter({ ...script, hook, body, cta, fullScript: fullText })}
          className="px-5 py-2.5 bg-[#2A2A3A] hover:bg-[#3A3A4A] text-white rounded-lg text-sm font-medium transition-colors"
        >
          Open in Teleprompter
        </button>
      </div>
    </div>
  )
}
