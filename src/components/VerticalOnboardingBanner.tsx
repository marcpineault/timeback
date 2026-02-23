'use client'

import Link from 'next/link'

interface VerticalOnboardingBannerProps {
  /** Whether the user has completed vertical onboarding */
  hasVertical: boolean
}

export default function VerticalOnboardingBanner({ hasVertical }: VerticalOnboardingBannerProps) {
  if (hasVertical) return null

  return (
    <div className="bg-white border border-[#e85d26]/30 rounded-2xl p-4 sm:p-5 mb-4 sm:mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="text-xl">🎯</span>
        <div>
          <h3 className="text-sm font-semibold text-[#0a0a0a]">
            Personalize your experience
          </h3>
          <p className="text-xs text-[#8a8580] mt-0.5">
            Tell us your profession to unlock customized scripts, content calendar, and AI generation.
          </p>
        </div>
      </div>
      <Link
        href="/dashboard/onboarding"
        className="px-4 py-2 bg-[#e85d26] hover:bg-[#d14d1a] text-white rounded-full text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0"
      >
        Set Up
      </Link>
    </div>
  )
}
