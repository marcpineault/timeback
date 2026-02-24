'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { analytics } from '@/components/Analytics'

// ─── Types ──────────────────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

// ─── Component ──────────────────────────────────────────────────────

export default function DashboardSuggestions() {
  const [weeklySuggestion, setWeeklySuggestion] = useState<WeeklySuggestion | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchSuggestions = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/suggestions')
      if (res.ok) {
        const data = await res.json()
        if (data.vertical && data.vertical !== 'OTHER') {
          setWeeklySuggestion(data.weeklySuggestion)
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
      </div>
    )
  }

  // Don't render anything if no data (vertical is null or OTHER)
  if (!weeklySuggestion) return null

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
                onClick={() => analytics.trackDashboardSuggestionClicked(
                  weeklySuggestion.type === 'dated' ? 'weekly_suggestion' : 'rotating_suggestion',
                  weeklySuggestion.calendarEntry?.category || weeklySuggestion.template?.category
                )}
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

    </div>
  )
}
