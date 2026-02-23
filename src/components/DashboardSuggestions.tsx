'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

// ─── Types ──────────────────────────────────────────────────────────

interface TemplateCard {
  id: string
  title: string
  category: string
}

interface WeeklySuggestion {
  type: 'dated' | 'rotating'
  calendarEntry?: {
    id: string
    title: string
    contentAngle: string
    category: string
    specificDate: string | null
  }
  template?: {
    id: string
    title: string
    category: string
  }
  dayLabel?: string
}

// ─── Constants ──────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  rate_reactions: { bg: 'bg-blue-500/15', text: 'text-blue-500' },
  first_time_buyers: { bg: 'bg-green-500/15', text: 'text-green-500' },
  renewals: { bg: 'bg-amber-500/15', text: 'text-amber-500' },
  myths: { bg: 'bg-purple-500/15', text: 'text-purple-500' },
  personal: { bg: 'bg-[rgba(232,93,38,0.1)]', text: 'text-[#e85d26]' },
}

const CATEGORY_LABELS: Record<string, string> = {
  rate_reactions: 'Rate Reactions',
  first_time_buyers: 'First-Time Buyers',
  renewals: 'Renewals',
  myths: 'Myths & Education',
  personal: 'Personal',
}

function getCategoryColors(category: string) {
  return CATEGORY_COLORS[category] || { bg: 'bg-gray-500/15', text: 'text-gray-500' }
}

function getCategoryLabel(category: string) {
  return CATEGORY_LABELS[category] || category
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

// ─── Component ──────────────────────────────────────────────────────

export default function DashboardSuggestions() {
  const [weeklySuggestion, setWeeklySuggestion] = useState<WeeklySuggestion | null>(null)
  const [templates, setTemplates] = useState<TemplateCard[]>([])
  const [loading, setLoading] = useState(true)

  const fetchSuggestions = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/suggestions')
      if (res.ok) {
        const data = await res.json()
        if (data.vertical && data.vertical !== 'OTHER') {
          setWeeklySuggestion(data.weeklySuggestion)
          setTemplates(data.templates)
        }
      }
    } catch (err) {
      console.error('Failed to fetch suggestions:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSuggestions()
  }, [fetchSuggestions])

  if (loading) {
    return (
      <div className="space-y-4 mb-6">
        <div className="bg-white border border-[#e0dbd4] rounded-2xl p-4">
          <div className="skeleton skeleton-text w-48 h-5 mb-2" />
          <div className="skeleton skeleton-text w-full h-4" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton w-full h-20 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  // Don't render anything if no data (vertical is null or OTHER)
  if (!weeklySuggestion && templates.length === 0) return null

  return (
    <div className="space-y-4 mb-6">
      {/* What to Post This Week */}
      {weeklySuggestion && (
        <div className={`rounded-2xl p-4 sm:p-5 ${
          weeklySuggestion.type === 'dated'
            ? 'bg-[#e85d26]/5 border border-[#e85d26]/20'
            : 'bg-white border border-[#e0dbd4]'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-[#0a0a0a] mb-1 flex items-center gap-1.5">
                {weeklySuggestion.type === 'dated' ? (
                  <>
                    <span>🔔</span>
                    What to Post This Week
                  </>
                ) : (
                  <>
                    <span>💡</span>
                    {weeklySuggestion.dayLabel || 'Suggested for today'}
                  </>
                )}
              </h3>

              {weeklySuggestion.type === 'dated' && weeklySuggestion.calendarEntry && (
                <div>
                  <p className="text-sm text-[#0a0a0a] font-medium">
                    {weeklySuggestion.calendarEntry.title}
                    {weeklySuggestion.calendarEntry.specificDate && (
                      <span className="text-[#e85d26] ml-1.5">
                        — {formatDate(weeklySuggestion.calendarEntry.specificDate)}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-[#8a8580] italic mt-0.5">
                    &ldquo;{weeklySuggestion.calendarEntry.contentAngle}&rdquo;
                  </p>
                </div>
              )}

              {weeklySuggestion.type === 'rotating' && (
                <div>
                  {weeklySuggestion.calendarEntry && (
                    <p className="text-xs text-[#8a8580] italic">
                      &ldquo;{weeklySuggestion.calendarEntry.contentAngle}&rdquo;
                    </p>
                  )}
                  {weeklySuggestion.template && (
                    <p className="text-sm text-[#0a0a0a] mt-0.5">
                      {weeklySuggestion.template.title}
                    </p>
                  )}
                </div>
              )}
            </div>

            {weeklySuggestion.template && (
              <Link
                href="/dashboard/ideate"
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 flex items-center gap-1 ${
                  weeklySuggestion.type === 'dated'
                    ? 'bg-[#e85d26] hover:bg-[#d14d1a] text-white'
                    : 'border border-[#e0dbd4] hover:border-[#e85d26] hover:text-[#e85d26] text-[#0a0a0a]'
                }`}
              >
                Get Script
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Your Script Templates Quick Access */}
      {templates.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-[#0a0a0a]">Your Script Templates</h3>
            <Link
              href="/dashboard/ideate"
              className="text-xs text-[#e85d26] hover:text-[#d14d1a] font-medium transition-colors flex items-center gap-0.5"
            >
              See all templates
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {templates.map(template => {
              const colors = getCategoryColors(template.category)
              return (
                <Link
                  key={template.id}
                  href="/dashboard/ideate"
                  className="bg-white border border-[#e0dbd4] rounded-xl p-3 hover:border-[#8a8580] hover:shadow-sm transition-all group"
                >
                  <h4 className="text-sm font-medium text-[#0a0a0a] mb-1.5 line-clamp-1 group-hover:text-[#e85d26] transition-colors">
                    {template.title}
                  </h4>
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${colors.bg} ${colors.text}`}>
                      {getCategoryLabel(template.category)}
                    </span>
                    <span className="text-xs text-[#e85d26] font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                      Use
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
