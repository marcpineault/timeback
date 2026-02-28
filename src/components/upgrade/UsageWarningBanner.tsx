'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { analytics } from '@/components/Analytics'

interface UsageWarningBannerProps {
  remaining: number
  resource?: 'videos' | 'ideate_generations'
  used: number
  limit: number
  plan: string
}

export default function UsageWarningBanner({
  remaining,
  resource = 'videos',
  used,
  limit,
  plan,
}: UsageWarningBannerProps) {
  const trackedRef = useRef(false)

  useEffect(() => {
    if (!trackedRef.current) {
      trackedRef.current = true
      analytics.trackLimitWarningShown(resource, used, limit, plan)
    }
  }, [resource, used, limit, plan])

  const label = resource === 'videos' ? 'video' : 'generation'
  const plural = remaining !== 1 ? 's' : ''

  return (
    <div className="flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl mb-4">
      <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
      <p className="text-sm text-[#0a0a0a] flex-1">
        <span className="font-medium">Running low:</span> You have {remaining} {label}{plural} left this month.
        <Link href="/pricing?source=usage_warning" className="text-[#e85d26] hover:text-[#d14d1a] ml-1 font-medium">
          Upgrade for more
        </Link>
      </p>
    </div>
  )
}
