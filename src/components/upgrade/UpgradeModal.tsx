'use client'

import { useEffect, useRef } from 'react'
import { PLANS } from '@/lib/plans'
import { analytics } from '@/components/Analytics'

interface UpgradeModalProps {
  isOpen: boolean
  onClose: () => void
  trigger: 'video_limit' | 'ideate_limit' | 'feature_gate'
  currentPlan: string
}

const TRIGGER_CONFIG = {
  video_limit: {
    headline: "You've used all your videos this month",
    description: 'Upgrade to keep creating without interruption.',
    resource: 'videos',
    source: 'limit_modal_video',
  },
  ideate_limit: {
    headline: "You've used all your AI generations",
    description: 'Upgrade for more AI-powered scripts and ideas.',
    resource: 'ideate_generations',
    source: 'limit_modal_ideate',
  },
  feature_gate: {
    headline: 'This feature requires an upgrade',
    description: 'Unlock premium features with a paid plan.',
    resource: 'feature',
    source: 'limit_modal_feature',
  },
}

function getRecommendedPlan(currentPlan: string): 'PRO' | 'CREATOR' {
  return currentPlan === 'PRO' ? 'CREATOR' : 'PRO'
}

export default function UpgradeModal({ isOpen, onClose, trigger, currentPlan }: UpgradeModalProps) {
  const trackedRef = useRef(false)
  const config = TRIGGER_CONFIG[trigger]
  const recommendedPlan = getRecommendedPlan(currentPlan)
  const recommended = PLANS[recommendedPlan]
  const current = PLANS[currentPlan as keyof typeof PLANS] || PLANS.FREE

  useEffect(() => {
    if (isOpen && !trackedRef.current) {
      trackedRef.current = true
      analytics.trackUpgradePromptShown('modal', config.resource, currentPlan, 'modal')
      analytics.trackLimitReached(config.resource, currentPlan)
    }
  }, [isOpen, config.resource, currentPlan])

  useEffect(() => {
    if (!isOpen) {
      trackedRef.current = false
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleCtaClick = () => {
    analytics.trackUpgradePromptClicked('modal', config.resource, currentPlan, recommendedPlan, 'modal')
  }

  const handleDismiss = () => {
    analytics.trackUpgradePromptDismissed('modal', config.resource, currentPlan, 'modal')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="bg-white border border-[#e0dbd4] rounded-2xl max-w-lg w-full p-6 sm:p-8 relative">
        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 p-1 text-[#8a8580] hover:text-[#0a0a0a] transition-colors"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Icon */}
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[rgba(232,93,38,0.1)] flex items-center justify-center">
          <svg className="w-7 h-7 text-[#e85d26]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
          </svg>
        </div>

        {/* Heading */}
        <h2 className="text-xl font-bold text-[#0a0a0a] text-center mb-1" style={{ fontFamily: "'Instrument Serif', serif" }}>
          {config.headline}
        </h2>
        <p className="text-[#8a8580] text-sm text-center mb-6">{config.description}</p>

        {/* Plan comparison */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {/* Current plan */}
          <div className="border border-[#e0dbd4] rounded-xl p-4 bg-[#faf7f2]">
            <p className="text-xs text-[#8a8580] mb-1">Current plan</p>
            <p className="text-sm font-semibold text-[#0a0a0a] mb-3">{current.name}</p>
            <ul className="space-y-1.5">
              {current.features.slice(0, 4).map((f, i) => (
                <li key={i} className="text-xs text-[#8a8580] flex items-start gap-1.5">
                  <span className="mt-0.5 flex-shrink-0">&#8226;</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Recommended plan */}
          <div className="border-2 border-[#e85d26] rounded-xl p-4 bg-white relative">
            <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-[#e85d26] text-white text-[10px] font-semibold rounded-full">
              RECOMMENDED
            </div>
            <p className="text-xs text-[#8a8580] mb-1">${recommended.price}/mo</p>
            <p className="text-sm font-semibold text-[#0a0a0a] mb-3">{recommended.name}</p>
            <ul className="space-y-1.5">
              {recommended.features.slice(0, 4).map((f, i) => (
                <li key={i} className="text-xs text-[#0a0a0a] flex items-start gap-1.5">
                  <svg className="w-3 h-3 text-[#e85d26] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* CTA */}
        <form action="/api/checkout" method="POST" className="mb-3">
          <input type="hidden" name="plan" value={recommendedPlan} />
          <input type="hidden" name="source" value={config.source} />
          <button
            type="submit"
            onClick={handleCtaClick}
            className="w-full py-3 bg-[#e85d26] hover:bg-[#d14d1a] text-white rounded-full font-medium transition-colors"
          >
            Upgrade to {recommended.name} &mdash; ${recommended.price}/mo
          </button>
        </form>

        <div className="text-center">
          <a
            href={`/pricing?source=${config.source}`}
            onClick={handleCtaClick}
            className="text-[#8a8580] hover:text-[#0a0a0a] text-sm transition-colors"
          >
            View all plans
          </a>
        </div>
      </div>
    </div>
  )
}
