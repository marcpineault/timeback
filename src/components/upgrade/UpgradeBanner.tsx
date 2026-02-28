'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { analytics } from '@/components/Analytics'

interface UpgradeBannerProps {
  context: 'usage_warning' | 'watermark' | 'resolution' | 'general'
  plan: string
  videosUsed?: number
  videosLimit?: number | null
  ideateUsed?: number
  ideateLimit?: number | null
  dismissKey?: string
  showDismiss?: boolean
  location?: string
}

const DISMISS_TTL = 7 * 24 * 60 * 60 * 1000 // 7 days

function getDismissState(key: string): boolean {
  try {
    const stored = localStorage.getItem(key)
    if (!stored) return false
    const { timestamp } = JSON.parse(stored)
    if (Date.now() - timestamp > DISMISS_TTL) {
      localStorage.removeItem(key)
      return false
    }
    return true
  } catch {
    return false
  }
}

function setDismissState(key: string) {
  try {
    localStorage.setItem(key, JSON.stringify({ timestamp: Date.now() }))
  } catch {
    // localStorage not available
  }
}

const CONTEXT_CONFIG = {
  usage_warning: {
    title: "You're running low on videos",
    getDescription: (used?: number, limit?: number | null, ideateUsed?: number, ideateLimit?: number | null) => {
      if (ideateLimit !== null && ideateLimit !== undefined && ideateUsed !== undefined) {
        return `You've used ${ideateUsed} of ${ideateLimit} AI generations this month. Upgrade for up to 200/mo.`
      }
      if (limit) {
        return `You've used ${used ?? 0} of ${limit} videos this month. Upgrade for up to 120 videos/mo.`
      }
      return 'Upgrade to unlock more videos and AI generations every month.'
    },
    cta: 'Upgrade Now',
    targetPlan: 'PRO',
    source: 'usage_warning_banner',
  },
  watermark: {
    title: 'Remove the TimeBack watermark',
    getDescription: () => 'Your videos have a TimeBack watermark. Upgrade to PRO to remove it and export in full 1080p.',
    cta: 'Remove Watermark',
    targetPlan: 'PRO',
    source: 'watermark_banner',
  },
  resolution: {
    title: 'Unlock 1080p video quality',
    getDescription: () => 'Your videos are limited to 720p. Upgrade to export in crisp 1080p resolution.',
    cta: 'Upgrade to 1080p',
    targetPlan: 'PRO',
    source: 'resolution_banner',
  },
  general: {
    title: 'Get more from TimeBack',
    getDescription: () => 'Unlock more videos, AI generations, 1080p export, and no watermark.',
    cta: 'See Plans',
    targetPlan: 'PRO',
    source: 'general_banner',
  },
}

export default function UpgradeBanner({
  context,
  plan,
  videosUsed,
  videosLimit,
  ideateUsed,
  ideateLimit,
  dismissKey,
  showDismiss = true,
  location = 'dashboard',
}: UpgradeBannerProps) {
  const [dismissed, setDismissed] = useState(true) // Start hidden, reveal after hydration
  const trackedRef = useRef(false)

  const storageKey = dismissKey || `tb_upgrade_dismissed_${context}`
  const config = CONTEXT_CONFIG[context]

  useEffect(() => {
    setDismissed(getDismissState(storageKey))
  }, [storageKey])

  useEffect(() => {
    if (!dismissed && !trackedRef.current) {
      trackedRef.current = true
      analytics.trackUpgradePromptShown('banner', context, plan, location)
    }
  }, [dismissed, context, plan, location])

  if (dismissed) return null

  const handleDismiss = () => {
    setDismissed(true)
    setDismissState(storageKey)
    analytics.trackUpgradePromptDismissed('banner', context, plan, location)
  }

  const handleCtaClick = () => {
    analytics.trackUpgradePromptClicked('banner', context, plan, config.targetPlan, location)
  }

  const description = config.getDescription(videosUsed, videosLimit, ideateUsed, ideateLimit)

  return (
    <div className="bg-white border border-[#e0dbd4] rounded-2xl p-4 sm:p-5 mb-4 relative overflow-hidden">
      {/* Accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#e85d26]" />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pl-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* Icon */}
          <div className="w-10 h-10 rounded-full bg-[rgba(232,93,38,0.1)] flex items-center justify-center flex-shrink-0">
            {context === 'watermark' ? (
              <svg className="w-5 h-5 text-[#e85d26]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            ) : context === 'usage_warning' ? (
              <svg className="w-5 h-5 text-[#e85d26]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-[#e85d26]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            )}
          </div>

          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#0a0a0a]">{config.title}</p>
            <p className="text-xs text-[#8a8580] mt-0.5">{description}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 pl-3 sm:pl-0">
          <form action="/api/checkout" method="POST">
            <input type="hidden" name="plan" value={config.targetPlan} />
            <input type="hidden" name="source" value={config.source} />
            <button
              type="submit"
              onClick={handleCtaClick}
              className="px-4 py-2 bg-[#e85d26] hover:bg-[#d14d1a] text-white rounded-full text-sm font-medium transition-colors whitespace-nowrap"
            >
              {config.cta}
            </button>
          </form>
          <Link
            href={`/pricing?source=${config.source}`}
            onClick={handleCtaClick}
            className="text-[#e85d26] hover:text-[#d14d1a] text-xs transition-colors whitespace-nowrap"
          >
            View plans
          </Link>
        </div>
      </div>

      {/* Dismiss button */}
      {showDismiss && (
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1 text-[#8a8580] hover:text-[#0a0a0a] transition-colors"
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}
