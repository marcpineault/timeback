'use client'

import { useState, useEffect } from 'react'
import { rateScript, type ScriptData } from '@/hooks/useIdeate'

interface Props {
  script: ScriptData
  onBack: () => void
  onOpenTeleprompter: (script: ScriptData) => void
  onScriptUpdated: (script: ScriptData) => void
}

function renderScriptWithNotes(text: string) {
  const parts = text.split(/(\[TEXT OVERLAY:[^\]]*\]|\[B-ROLL:[^\]]*\]|\[ENERGY SHIFT:[^\]]*\]|\[PATTERN INTERRUPT\]|\[PAUSE\])/)

  return parts.map((part, i) => {
    if (part.startsWith('[TEXT OVERLAY:')) {
      const content = part.replace('[TEXT OVERLAY:', '').replace(']', '').trim().replace(/^"|"$/g, '')
      return (
        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/15 text-blue-400 rounded text-xs font-medium mx-0.5">
          TEXT: {content}
        </span>
      )
    }
    if (part.startsWith('[B-ROLL:')) {
      const content = part.replace('[B-ROLL:', '').replace(']', '').trim()
      return (
        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-500/15 text-gray-400 rounded text-xs italic mx-0.5">
          B-Roll: {content}
        </span>
      )
    }
    if (part.startsWith('[ENERGY SHIFT:')) {
      const content = part.replace('[ENERGY SHIFT:', '').replace(']', '').trim()
      return (
        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-500/15 text-yellow-400 rounded text-xs mx-0.5">
          Energy: {content}
        </span>
      )
    }
    if (part === '[PATTERN INTERRUPT]') {
      return (
        <span key={i} className="block my-2 border-t border-dashed border-orange-500/40 pt-1 text-orange-400 text-[10px] uppercase tracking-wider">
          pattern interrupt — cut/zoom/angle change
        </span>
      )
    }
    if (part === '[PAUSE]') {
      return (
        <span key={i} className="text-[#8a8580] text-xs mx-0.5">||</span>
      )
    }
    return <span key={i} className="text-[#0a0a0a]">{part}</span>
  })
}

export default function ScriptView({ script, onBack, onOpenTeleprompter, onScriptUpdated }: Props) {
  const [hook, setHook] = useState(script.hook)
  const [body, setBody] = useState(script.body)
  const [cta, setCta] = useState(script.cta)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [currentRating, setCurrentRating] = useState<string | null>(script.rating)
  const [showSpcl, setShowSpcl] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  useEffect(() => {
    setHook(script.hook)
    setBody(script.body)
    setCta(script.cta)
    setCurrentRating(script.rating)
  }, [script])

  const fullText = `${hook}\n\n${body}\n\n${cta}`
  const spokenText = fullText
    .replace(/\[PAUSE\]/g, '')
    .replace(/\[TEXT OVERLAY:[^\]]*\]/g, '')
    .replace(/\[B-ROLL:[^\]]*\]/g, '')
    .replace(/\[ENERGY SHIFT:[^\]]*\]/g, '')
    .replace(/\[PATTERN INTERRUPT\]/g, '')
  const wordCount = spokenText.split(/\s+/).filter(Boolean).length
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
            className="text-[#8a8580] hover:text-[#0a0a0a] text-sm transition-colors"
          >
            &larr; Back
          </button>
          <h2 className="text-lg font-semibold text-[#0a0a0a]">{script.title}</h2>
        </div>

        <div className="flex items-center gap-2">
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
      <div className="flex items-center gap-6 mb-6">
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
          <div>
            <span className="text-[#8a8580] text-xs">From idea</span>
            <p className="text-[#8a8580] text-sm">{script.idea.title}</p>
          </div>
        )}
      </div>

      {/* Script Sections */}
      <div className="space-y-4 mb-6">
        <div className="bg-white border border-[#e0dbd4] rounded-2xl p-5">
          <label className="block text-[#e85d26] text-xs font-semibold uppercase tracking-wider mb-2">Hook</label>
          <textarea
            value={hook}
            onChange={(e) => setHook(e.target.value)}
            rows={2}
            className="w-full bg-[#f5f0e8] border border-[#e0dbd4] text-[#0a0a0a] rounded-full px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#e85d26] focus:border-[#e85d26] resize-none"
          />
        </div>

        <div className="bg-white border border-[#e0dbd4] rounded-2xl p-5">
          <label className="block text-[#e85d26] text-xs font-semibold uppercase tracking-wider mb-2">Body</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            className="w-full bg-[#f5f0e8] border border-[#e0dbd4] text-[#0a0a0a] rounded-full px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#e85d26] focus:border-[#e85d26] resize-none"
          />
        </div>

        <div className="bg-white border border-[#e0dbd4] rounded-2xl p-5">
          <label className="block text-green-400 text-xs font-semibold uppercase tracking-wider mb-2">Call to Action</label>
          <textarea
            value={cta}
            onChange={(e) => setCta(e.target.value)}
            rows={2}
            className="w-full bg-[#f5f0e8] border border-[#e0dbd4] text-[#0a0a0a] rounded-full px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#e85d26] focus:border-[#e85d26] resize-none"
          />
        </div>
      </div>

      {/* Script Preview with Production Notes */}
      {(fullText.includes('[TEXT OVERLAY:') || fullText.includes('[PATTERN INTERRUPT]') || fullText.includes('[B-ROLL:') || fullText.includes('[ENERGY SHIFT:')) && (
        <div className="mb-6">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="text-[#8a8580] hover:text-[#0a0a0a] text-sm transition-colors flex items-center gap-1 mb-3"
          >
            <span>{showPreview ? '▼' : '▶'}</span> Production Notes Preview
          </button>
          {showPreview && (
            <div className="bg-white border border-[#e0dbd4] rounded-2xl p-5">
              <div className="text-sm leading-relaxed whitespace-pre-wrap">
                {renderScriptWithNotes(fullText)}
              </div>
            </div>
          )}
        </div>
      )}

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
      <div className="flex items-center gap-3">
        {hasChanges && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 bg-[#e85d26] hover:bg-[#d14d1a] disabled:opacity-50 text-[#0a0a0a] rounded-full text-sm font-medium transition-colors"
          >
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
          </button>
        )}
        <button
          onClick={() => onOpenTeleprompter({ ...script, hook, body, cta, fullScript: fullText })}
          className="px-5 py-2.5 bg-[#f5f0e8] hover:bg-[#e0dbd4] text-[#0a0a0a] rounded-full text-sm font-medium transition-colors"
        >
          Open in Teleprompter
        </button>
      </div>
    </div>
  )
}
