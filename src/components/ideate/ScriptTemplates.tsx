'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { analytics } from '@/components/Analytics'

// ─── Types ──────────────────────────────────────────────────────────

interface ScriptTemplate {
  id: string
  vertical: string
  category: string
  title: string
  scriptBody: string
  wordCount: number
  tags: string[]
  sortOrder: number
}

interface Props {
  onScriptSaved: () => void
  initialCategory?: string | null
}

// ─── Constants ──────────────────────────────────────────────────────

const CATEGORIES_BY_VERTICAL: Record<string, { value: string; label: string }[]> = {
  MORTGAGE_BROKER: [
    { value: 'all', label: 'All' },
    { value: 'rate_reactions', label: 'Rate Reactions' },
    { value: 'first_time_buyers', label: 'First-Time Buyers' },
    { value: 'renewals', label: 'Renewals' },
    { value: 'myths', label: 'Myths & Education' },
    { value: 'personal', label: 'Personal' },
  ],
  REAL_ESTATE_AGENT: [
    { value: 'all', label: 'All' },
    { value: 'market_updates', label: 'Market Updates' },
    { value: 'buyer_tips', label: 'Buyer Tips' },
    { value: 'seller_strategies', label: 'Seller Strategies' },
    { value: 'neighborhood_guides', label: 'Neighborhood Guides' },
    { value: 'behind_the_scenes', label: 'Behind the Scenes' },
    { value: 'personal', label: 'Personal' },
  ],
  FINANCIAL_ADVISOR: [
    { value: 'all', label: 'All' },
    { value: 'education', label: 'Education' },
    { value: 'myth_busting', label: 'Myth Busting' },
    { value: 'trust_building', label: 'Trust Building' },
    { value: 'seasonal', label: 'Seasonal' },
    { value: 'social_proof', label: 'Social Proof' },
    { value: 'personal_brand', label: 'Personal Brand' },
  ],
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  // Mortgage Broker
  rate_reactions: { bg: 'bg-blue-500/15', text: 'text-blue-500' },
  first_time_buyers: { bg: 'bg-green-500/15', text: 'text-green-500' },
  renewals: { bg: 'bg-amber-500/15', text: 'text-amber-500' },
  myths: { bg: 'bg-purple-500/15', text: 'text-purple-500' },
  personal: { bg: 'bg-[rgba(232,93,38,0.1)]', text: 'text-[#e85d26]' },
  // Real Estate Agent
  market_updates: { bg: 'bg-blue-500/15', text: 'text-blue-500' },
  buyer_tips: { bg: 'bg-green-500/15', text: 'text-green-500' },
  seller_strategies: { bg: 'bg-amber-500/15', text: 'text-amber-500' },
  neighborhood_guides: { bg: 'bg-teal-500/15', text: 'text-teal-500' },
  behind_the_scenes: { bg: 'bg-purple-500/15', text: 'text-purple-500' },
  // Financial Advisor
  education: { bg: 'bg-blue-500/15', text: 'text-blue-500' },
  myth_busting: { bg: 'bg-purple-500/15', text: 'text-purple-500' },
  trust_building: { bg: 'bg-green-500/15', text: 'text-green-500' },
  seasonal: { bg: 'bg-amber-500/15', text: 'text-amber-500' },
  social_proof: { bg: 'bg-teal-500/15', text: 'text-teal-500' },
  personal_brand: { bg: 'bg-[rgba(232,93,38,0.1)]', text: 'text-[#e85d26]' },
}

const VERTICAL_DESCRIPTIONS: Record<string, string> = {
  MORTGAGE_BROKER: 'Ready-to-use scripts for mortgage brokers. Pick one, customize it, and record.',
  REAL_ESTATE_AGENT: 'Ready-to-use scripts for real estate agents. Pick one, customize it, and record.',
  FINANCIAL_ADVISOR: 'Ready-to-use scripts for financial advisors. Pick one, customize it, and record.',
}

function getCategoryLabel(category: string, vertical: string | null): string {
  const categories = vertical ? (CATEGORIES_BY_VERTICAL[vertical] || []) : []
  return categories.find(c => c.value === category)?.label || category
}

function getCategoryColors(category: string) {
  return CATEGORY_COLORS[category] || { bg: 'bg-gray-500/15', text: 'text-gray-500' }
}

function getPreviewLines(scriptBody: string): string {
  const lines = scriptBody.split('\n').filter(l => l.trim())
  return lines.slice(0, 2).join(' ').slice(0, 120) + (lines.join(' ').length > 120 ? '...' : '')
}

function applyMarketReplace(text: string, market: string | null): string {
  if (!market) return text
  return text.replace(/\[city\]/gi, market).replace(/\[market\]/gi, market)
}

// ─── Component ──────────────────────────────────────────────────────

export default function ScriptTemplates({ onScriptSaved, initialCategory }: Props) {
  const [templates, setTemplates] = useState<ScriptTemplate[]>([])
  const [vertical, setVertical] = useState<string | null>(null)
  const [market, setMarket] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState(initialCategory || 'all')
  const [selectedTemplate, setSelectedTemplate] = useState<ScriptTemplate | null>(null)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [savedMessage, setSavedMessage] = useState(false)

  // Update category filter when navigating from calendar
  useEffect(() => {
    if (initialCategory) setCategoryFilter(initialCategory)
  }, [initialCategory])

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/ideate/templates')
      if (res.ok) {
        const data = await res.json()
        setTemplates(data.templates)
        setVertical(data.vertical)
        setMarket(data.market)
      }
    } catch (err) {
      console.error('Failed to fetch templates:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  const filteredTemplates = categoryFilter === 'all'
    ? templates
    : templates.filter(t => t.category === categoryFilter)

  // ─── Actions ────────────────────────────────────────────────────

  const handleCopyToClipboard = async () => {
    if (!selectedTemplate) return
    const text = applyMarketReplace(selectedTemplate.scriptBody, market)
    await navigator.clipboard.writeText(text)
    setCopied(true)
    analytics.trackTemplateCopied(selectedTemplate.id)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSaveToScripts = async () => {
    if (!selectedTemplate || saving) return
    setSaving(true)
    try {
      const res = await fetch('/api/ideate/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: selectedTemplate.id }),
      })
      if (res.ok) {
        setSavedMessage(true)
        analytics.trackTemplateSavedToScripts(selectedTemplate.id)
        onScriptSaved()
        setTimeout(() => setSavedMessage(false), 2000)
      }
    } catch (err) {
      console.error('Failed to save template:', err)
    } finally {
      setSaving(false)
    }
  }

  // ─── Empty / Fallback States ──────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="bg-white border border-[#e0dbd4] rounded-2xl p-6">
          <div className="skeleton skeleton-text w-48 h-6 mb-3" />
          <div className="skeleton skeleton-text w-full h-4 mb-2" />
          <div className="skeleton skeleton-text w-3/4 h-4 mb-6" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="skeleton w-full h-40 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (vertical === null) {
    return (
      <div className="bg-white border border-[#e0dbd4] rounded-2xl p-8 sm:p-12 text-center">
        <div className="w-20 h-20 mx-auto mb-6 bg-[rgba(232,93,38,0.08)] rounded-full flex items-center justify-center">
          <svg className="w-10 h-10 text-[#e85d26]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-[#0a0a0a] mb-2" style={{ fontFamily: "'Instrument Serif', serif" }}>
          Complete your profile setup
        </h2>
        <p className="text-[#8a8580] text-sm mb-6 max-w-md mx-auto">
          Complete your profile setup to get scripts tailored to your industry.
        </p>
        <Link
          href="/dashboard/onboarding"
          className="inline-block px-6 py-2.5 bg-[#e85d26] hover:bg-[#d14d1a] text-white rounded-full text-sm font-medium transition-colors"
        >
          Set Up Profile
        </Link>
      </div>
    )
  }

  if (vertical === 'OTHER') {
    return (
      <div className="bg-white border border-[#e0dbd4] rounded-2xl p-8 sm:p-12 text-center">
        <div className="w-20 h-20 mx-auto mb-6 bg-[rgba(232,93,38,0.08)] rounded-full flex items-center justify-center">
          <svg className="w-10 h-10 text-[#e85d26]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-[#0a0a0a] mb-2" style={{ fontFamily: "'Instrument Serif', serif" }}>
          Templates coming for your vertical
        </h2>
        <p className="text-[#8a8580] text-sm mb-6 max-w-md mx-auto">
          Script templates are available for Mortgage Brokers, Real Estate Agents, and Financial Advisors.
          Switch your profession in Profile to unlock them.
        </p>
        <Link
          href="/dashboard/onboarding"
          className="inline-block px-6 py-2.5 bg-[#e85d26] hover:bg-[#d14d1a] text-white rounded-full text-sm font-medium transition-colors"
        >
          Change Profession
        </Link>
      </div>
    )
  }

  if (templates.length === 0) {
    return (
      <div className="bg-white border border-[#e0dbd4] rounded-2xl p-8 sm:p-12 text-center">
        <div className="w-20 h-20 mx-auto mb-6 bg-[rgba(232,93,38,0.08)] rounded-full flex items-center justify-center">
          <svg className="w-10 h-10 text-[#e85d26]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-[#0a0a0a] mb-2" style={{ fontFamily: "'Instrument Serif', serif" }}>
          No templates available yet
        </h2>
        <p className="text-[#8a8580] text-sm max-w-md mx-auto">
          Check back soon! We&apos;re adding new script templates regularly.
        </p>
      </div>
    )
  }

  // ─── Detail View ────────────────────────────────────────────────

  if (selectedTemplate) {
    const colors = getCategoryColors(selectedTemplate.category)
    const displayText = applyMarketReplace(selectedTemplate.scriptBody, market)
    const estSeconds = Math.round((selectedTemplate.wordCount / 150) * 60)

    return (
      <div className="animate-fadeIn">
        {/* Back button */}
        <button
          onClick={() => {
            setSelectedTemplate(null)
            setCopied(false)
            setSavedMessage(false)
          }}
          className="flex items-center gap-1 text-[#8a8580] hover:text-[#0a0a0a] text-sm mb-4 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Templates
        </button>

        <div className="bg-white border border-[#e0dbd4] rounded-2xl p-5 sm:p-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
            <div>
              <h2 className="text-lg font-semibold text-[#0a0a0a] mb-2">{selectedTemplate.title}</h2>
              <div className="flex items-center gap-2">
                <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
                  {getCategoryLabel(selectedTemplate.category, vertical)}
                </span>
                <span className="text-xs text-[#8a8580]">
                  {selectedTemplate.wordCount} words &middot; ~{estSeconds}s
                </span>
              </div>
            </div>
          </div>

          {/* Script body */}
          <div className="bg-[#f5f0e8] border border-[#e0dbd4] rounded-xl p-4 sm:p-5 mb-5">
            <pre className="whitespace-pre-wrap text-sm text-[#0a0a0a] leading-relaxed font-sans">
              {displayText}
            </pre>
          </div>

          {/* Tags */}
          {selectedTemplate.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-5">
              {selectedTemplate.tags.map(tag => (
                <span
                  key={tag}
                  className="px-2 py-0.5 bg-[#f5f0e8] text-[#8a8580] rounded-full text-xs"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={handleCopyToClipboard}
              className="flex-1 px-4 py-2.5 border border-[#e0dbd4] hover:border-[#8a8580] text-[#0a0a0a] rounded-full text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              {copied ? (
                <>
                  <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy to Clipboard
                </>
              )}
            </button>

            <button
              onClick={handleSaveToScripts}
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-[#e85d26] hover:bg-[#d14d1a] disabled:opacity-50 text-white rounded-full text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              {savedMessage ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Saved to Scripts!
                </>
              ) : saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                'Save to My Scripts'
              )}
            </button>

          </div>
        </div>
      </div>
    )
  }

  // ─── Grid View ──────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-[#0a0a0a] mb-1">Script Templates</h2>
        <p className="text-[#8a8580] text-sm">
          {vertical ? (VERTICAL_DESCRIPTIONS[vertical] || 'Ready-to-use scripts. Pick one, customize it, and record.') : 'Ready-to-use scripts. Pick one, customize it, and record.'}
        </p>
      </div>

      {/* Category filter pills */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 mb-5">
        <div className="flex gap-1.5 w-fit">
          {(vertical ? (CATEGORIES_BY_VERTICAL[vertical] || [{ value: 'all', label: 'All' }]) : [{ value: 'all', label: 'All' }]).map(cat => (
            <button
              key={cat.value}
              onClick={() => setCategoryFilter(cat.value)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                categoryFilter === cat.value
                  ? 'bg-[#e85d26] text-white'
                  : 'bg-white border border-[#e0dbd4] text-[#8a8580] hover:text-[#0a0a0a] hover:border-[#8a8580]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Template cards grid */}
      {filteredTemplates.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-[#8a8580] text-sm">No templates in this category.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map(template => {
            const colors = getCategoryColors(template.category)
            const estSeconds = Math.round((template.wordCount / 150) * 60)

            return (
              <button
                key={template.id}
                onClick={() => {
                  setSelectedTemplate(template)
                  analytics.trackTemplateViewed(template.id)
                }}
                className="text-left bg-white border border-[#e0dbd4] rounded-2xl p-4 hover:border-[#8a8580] hover:shadow-sm transition-all group"
              >
                {/* Title */}
                <h3 className="font-semibold text-[#0a0a0a] text-sm mb-2 group-hover:text-[#e85d26] transition-colors line-clamp-2">
                  {template.title}
                </h3>

                {/* Category badge */}
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text} mb-3`}>
                  {getCategoryLabel(template.category, vertical)}
                </span>

                {/* Preview text */}
                <p className="text-xs text-[#8a8580] mb-3 line-clamp-2">
                  {getPreviewLines(template.scriptBody)}
                </p>

                {/* Footer: word count + duration */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#8a8580]">
                    {template.wordCount} words &middot; ~{estSeconds}s
                  </span>
                  <span className="text-xs text-[#e85d26] font-medium sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                    Use Script
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
