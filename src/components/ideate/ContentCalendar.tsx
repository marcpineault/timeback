'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { analytics } from '@/components/Analytics'

// ─── Types ──────────────────────────────────────────────────────────

interface CalendarEntry {
  id: string
  vertical: string
  month: number
  title: string
  description: string
  contentAngle: string
  category: string
  isRecurring: boolean
  specificDate: string | null
}

interface Props {
  onNavigateToTemplates: (category: string) => void
  onNavigateToIdeas: (topic: string) => void
}

// ─── Constants ──────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

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

const CATEGORY_LABELS: Record<string, string> = {
  // Mortgage Broker
  rate_reactions: 'Rate Reactions',
  first_time_buyers: 'First-Time Buyers',
  renewals: 'Renewals',
  myths: 'Myths & Education',
  personal: 'Personal',
  // Real Estate Agent
  market_updates: 'Market Updates',
  buyer_tips: 'Buyer Tips',
  seller_strategies: 'Seller Strategies',
  neighborhood_guides: 'Neighborhood Guides',
  behind_the_scenes: 'Behind the Scenes',
  // Financial Advisor
  education: 'Education',
  myth_busting: 'Myth Busting',
  trust_building: 'Trust Building',
  seasonal: 'Seasonal',
  social_proof: 'Social Proof',
  personal_brand: 'Personal Brand',
}

const VERTICAL_CALENDAR_DESCRIPTIONS: Record<string, string> = {
  MORTGAGE_BROKER: 'Timely content ideas for mortgage brokers. Know what to post and when.',
  REAL_ESTATE_AGENT: 'Timely content ideas for real estate agents. Know what to post and when.',
  FINANCIAL_ADVISOR: 'Timely content ideas for financial advisors. Know what to post and when.',
}

function getCategoryColors(category: string) {
  return CATEGORY_COLORS[category] || { bg: 'bg-gray-500/15', text: 'text-gray-500' }
}

function getCategoryLabel(category: string) {
  return CATEGORY_LABELS[category] || category
}

function formatSpecificDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function daysUntil(dateStr: string): number {
  const now = new Date()
  // Compare using UTC dates to avoid timezone shifts
  const nowUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(dateStr)
  const targetUTC = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate())
  return Math.ceil((targetUTC - nowUTC) / (1000 * 60 * 60 * 24))
}

// ─── Component ──────────────────────────────────────────────────────

export default function ContentCalendar({ onNavigateToTemplates, onNavigateToIdeas }: Props) {
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1) // 1-indexed
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [allEntries, setAllEntries] = useState<CalendarEntry[]>([])
  const [availableCategories, setAvailableCategories] = useState<string[]>([])
  const [vertical, setVertical] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchCalendar = useCallback(async () => {
    try {
      const res = await fetch('/api/ideate/calendar')
      if (res.ok) {
        const data = await res.json()
        setAllEntries(data.entries)
        setVertical(data.vertical)
        setAvailableCategories(data.availableTemplateCategories || [])
        analytics.trackCalendarViewed(selectedMonth)
      }
    } catch (err) {
      console.error('Failed to fetch calendar:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedMonth])

  useEffect(() => {
    fetchCalendar()
  }, [fetchCalendar])

  // Filter entries for the selected month
  const monthEntries = useMemo(() => {
    return allEntries.filter(e => e.month === selectedMonth)
  }, [allEntries, selectedMonth])

  // "Coming Up" entries — items with specific_date within the next 14 days (only for current month)
  const isCurrentMonth = selectedMonth === (now.getMonth() + 1) && selectedYear === now.getFullYear()
  const comingUpEntries = useMemo(() => {
    if (!isCurrentMonth) return []
    return monthEntries.filter(e => {
      if (!e.specificDate) return false
      const days = daysUntil(e.specificDate)
      return days >= 0 && days <= 14
    })
  }, [monthEntries, isCurrentMonth])

  // BoC rate decision alert — within 7 days
  const bocAlert = useMemo(() => {
    if (!isCurrentMonth) return null
    const bocEntry = monthEntries.find(e => {
      if (!e.specificDate) return false
      if (!e.title.toLowerCase().includes('boc') && !e.title.toLowerCase().includes('rate decision')) return false
      const days = daysUntil(e.specificDate)
      return days >= 0 && days <= 7
    })
    return bocEntry || null
  }, [monthEntries, isCurrentMonth])

  // Month navigation
  const goToPrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12)
      setSelectedYear(y => y - 1)
    } else {
      setSelectedMonth(m => m - 1)
    }
  }

  const goToNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1)
      setSelectedYear(y => y + 1)
    } else {
      setSelectedMonth(m => m + 1)
    }
  }

  const goToToday = () => {
    setSelectedMonth(now.getMonth() + 1)
    setSelectedYear(now.getFullYear())
  }

  const handleGetScript = (entry: CalendarEntry) => {
    analytics.trackCalendarScriptClicked(entry.id, entry.category)
    if (availableCategories.includes(entry.category)) {
      onNavigateToTemplates(entry.category)
    } else {
      onNavigateToIdeas(entry.contentAngle)
    }
  }

  // ─── Loading ────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="bg-white border border-[#e0dbd4] rounded-2xl p-6">
          <div className="skeleton skeleton-text w-48 h-6 mb-3" />
          <div className="skeleton skeleton-text w-full h-4 mb-2" />
          <div className="skeleton skeleton-text w-3/4 h-4 mb-6" />
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="skeleton w-full h-24 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ─── Fallback States ──────────────────────────────────────────

  if (vertical === null || vertical === 'OTHER') {
    return (
      <div className="bg-white border border-[#e0dbd4] rounded-2xl p-8 sm:p-12 text-center">
        <div className="w-20 h-20 mx-auto mb-6 bg-[rgba(232,93,38,0.08)] rounded-full flex items-center justify-center">
          <span className="text-3xl">📅</span>
        </div>
        <h2 className="text-xl font-semibold text-[#0a0a0a] mb-2" style={{ fontFamily: "'Instrument Serif', serif" }}>
          {vertical === null
            ? 'Unlock your content calendar'
            : 'Calendar coming for your vertical'}
        </h2>
        <p className="text-[#8a8580] text-sm mb-6 max-w-md mx-auto">
          {vertical === null
            ? 'Set your profession to unlock a personalized content calendar with timely post ideas.'
            : 'Content calendars are available for Mortgage Brokers, Real Estate Agents, and Financial Advisors. Switch your profession in Profile to unlock.'}
        </p>
        <Link
          href="/dashboard/onboarding"
          className="inline-block px-6 py-2.5 bg-[#e85d26] hover:bg-[#d14d1a] text-white rounded-full text-sm font-medium transition-colors"
        >
          {vertical === null ? 'Set Up Profile' : 'Change Profession'}
        </Link>
      </div>
    )
  }

  // ─── Main Calendar View ───────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-[#0a0a0a] mb-1">Content Calendar</h2>
        <p className="text-[#8a8580] text-sm">
          {vertical ? (VERTICAL_CALENDAR_DESCRIPTIONS[vertical] || 'Timely content ideas. Know what to post and when.') : 'Timely content ideas. Know what to post and when.'}
        </p>
      </div>

      {/* Month Selector */}
      <div className="flex items-center justify-between bg-white border border-[#e0dbd4] rounded-2xl p-3 mb-5">
        <button
          onClick={goToPrevMonth}
          className="p-2 hover:bg-[#f5f0e8] rounded-lg transition-colors"
        >
          <svg className="w-5 h-5 text-[#8a8580]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-[#0a0a0a]">
            {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
          </h3>
          {!isCurrentMonth && (
            <button
              onClick={goToToday}
              className="text-xs text-[#e85d26] hover:text-[#d14d1a] font-medium transition-colors"
            >
              Today
            </button>
          )}
        </div>
        <button
          onClick={goToNextMonth}
          className="p-2 hover:bg-[#f5f0e8] rounded-lg transition-colors"
        >
          <svg className="w-5 h-5 text-[#8a8580]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* BoC Rate Decision Alert */}
      {bocAlert && bocAlert.specificDate && (
        <div className="bg-[#e85d26]/5 border border-[#e85d26]/20 rounded-2xl p-4 mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="text-xl flex-shrink-0">🔔</span>
            <div>
              <p className="text-sm font-semibold text-[#0a0a0a]">
                Rate Decision on {formatSpecificDate(bocAlert.specificDate)}
              </p>
              <p className="text-xs text-[#8a8580] mt-0.5">
                Have your reaction video ready! Film and post within hours for maximum reach.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigateToTemplates('rate_reactions')}
            className="px-4 py-2 bg-[#e85d26] hover:bg-[#d14d1a] text-white rounded-full text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0"
          >
            Rate Reaction Scripts
          </button>
        </div>
      )}

      {/* Coming Up Section */}
      {comingUpEntries.length > 0 && (
        <div className="mb-5">
          <h4 className="text-sm font-semibold text-[#0a0a0a] mb-3 flex items-center gap-1.5">
            <span>📅</span> Coming Up
          </h4>
          <div className="space-y-2">
            {comingUpEntries.map(entry => {
              const colors = getCategoryColors(entry.category)
              const days = entry.specificDate ? daysUntil(entry.specificDate) : null

              return (
                <div
                  key={`coming-${entry.id}`}
                  className="bg-[#e85d26]/5 border border-[#e85d26]/15 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-[#e85d26]">
                        {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`}
                        {entry.specificDate && ` — ${formatSpecificDate(entry.specificDate)}`}
                      </span>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${colors.bg} ${colors.text}`}>
                        {getCategoryLabel(entry.category)}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-[#0a0a0a]">{entry.title}</p>
                    <p className="text-xs text-[#8a8580] italic mt-0.5">&ldquo;{entry.contentAngle}&rdquo;</p>
                  </div>
                  <button
                    onClick={() => handleGetScript(entry)}
                    className="text-xs text-[#e85d26] hover:text-[#d14d1a] font-medium transition-colors whitespace-nowrap flex items-center gap-1"
                  >
                    Get Script
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Month Entries */}
      {monthEntries.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-[#8a8580] text-sm">No content suggestions for this month.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {monthEntries.map(entry => {
            const colors = getCategoryColors(entry.category)
            const hasDate = !!entry.specificDate

            return (
              <div
                key={entry.id}
                className="bg-white border border-[#e0dbd4] rounded-xl p-4 hover:border-[#8a8580] transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Date line */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs text-[#8a8580]">
                        {hasDate
                          ? formatSpecificDate(entry.specificDate!)
                          : `Anytime in ${MONTH_NAMES[selectedMonth - 1]}`}
                      </span>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${colors.bg} ${colors.text}`}>
                        {getCategoryLabel(entry.category)}
                      </span>
                    </div>

                    {/* Title */}
                    <h4 className="text-sm font-semibold text-[#0a0a0a] mb-1">{entry.title}</h4>

                    {/* Content angle */}
                    <p className="text-sm text-[#8a8580] italic mb-1">&ldquo;{entry.contentAngle}&rdquo;</p>

                    {/* Description */}
                    <p className="text-xs text-[#8a8580]">{entry.description}</p>
                  </div>

                  {/* Get Script button */}
                  <button
                    onClick={() => handleGetScript(entry)}
                    className="px-3 py-1.5 border border-[#e0dbd4] hover:border-[#e85d26] hover:text-[#e85d26] text-[#0a0a0a] rounded-full text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1 flex-shrink-0"
                  >
                    Get Script
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
