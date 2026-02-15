'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const DISMISS_KEY = 'timeback_onboarding_dismissed'

interface OnboardingBannerProps {
  /** Which step is currently active: 'ideate' | 'editor' | 'schedule' */
  activeStep: 'ideate' | 'editor' | 'schedule'
}

const steps = [
  {
    number: 1,
    key: 'ideate' as const,
    title: 'Generate Scripts',
    description: 'Tell us your industry. AI writes scroll-stopping video scripts.',
    href: '/dashboard/ideate',
    badge: '5 minutes',
  },
  {
    number: 2,
    key: 'editor' as const,
    title: 'Record & Upload',
    description: 'Film your videos and upload them here. AI handles the editing.',
    href: '/dashboard',
    badge: '1 hour',
  },
  {
    number: 3,
    key: 'schedule' as const,
    title: 'Schedule & Post',
    description: 'Your finished videos get auto-scheduled to Instagram.',
    href: '/dashboard/schedule',
    badge: 'Automatic',
  },
]

export default function OnboardingBanner({ activeStep }: OnboardingBannerProps) {
  const [dismissed, setDismissed] = useState(true) // Start hidden, reveal after hydration check

  useEffect(() => {
    try {
      const stored = localStorage.getItem(DISMISS_KEY)
      setDismissed(stored === 'true')
    } catch {
      setDismissed(false)
    }
  }, [])

  const handleDismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, 'true')
    } catch {
      // localStorage not available
    }
  }

  if (dismissed) return null

  return (
    <div className="bg-white border border-[#e0dbd4] rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 relative">
      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 sm:top-4 sm:right-4 p-1 text-[#8a8580] hover:text-[#0a0a0a] transition-colors"
        aria-label="Dismiss onboarding guide"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Heading */}
      <h2
        className="text-lg sm:text-xl font-semibold text-[#0a0a0a] mb-1 pr-8"
        style={{ fontFamily: "'Instrument Serif', serif" }}
      >
        Your first month of content starts here
      </h2>
      <p className="text-[#8a8580] text-sm mb-4 sm:mb-5">
        Follow these three steps to create and publish your first videos.
      </p>

      {/* Steps */}
      <div className="flex flex-col sm:flex-row gap-3">
        {steps.map((step) => {
          const isActive = step.key === activeStep
          const cardClass = `
            flex-1 rounded-xl p-3 sm:p-4 border transition-all
            ${isActive
              ? 'border-[#e85d26] bg-[rgba(232,93,38,0.06)]'
              : 'border-[#e0dbd4] bg-[#faf7f2] hover:border-[#8a8580]'
            }
          `

          const content = (
            <div className="flex items-start gap-3">
              {/* Step number circle */}
              <div
                className={`
                  w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-semibold
                  ${isActive
                    ? 'bg-[#e85d26] text-white'
                    : 'bg-[#e0dbd4] text-[#8a8580]'
                  }
                `}
              >
                {step.number}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-[#0a0a0a]">
                    {step.title}
                  </span>
                  <span className="text-[10px] sm:text-xs font-medium px-2 py-0.5 rounded-full bg-[rgba(232,93,38,0.1)] text-[#e85d26]">
                    {step.badge}
                  </span>
                </div>
                <p className="text-xs text-[#8a8580] mt-1 leading-relaxed">
                  {step.description}
                </p>
              </div>
            </div>
          )

          if (isActive) {
            return (
              <div key={step.key} className={cardClass}>
                {content}
              </div>
            )
          }

          return (
            <Link key={step.key} href={step.href} className={cardClass}>
              {content}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
