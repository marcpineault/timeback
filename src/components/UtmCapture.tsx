'use client'

import { useEffect, Suspense } from 'react'
import { useSearchParams, usePathname } from 'next/navigation'

const STORAGE_KEY = 'tb_attribution'

function UtmCaptureInner() {
  const searchParams = useSearchParams()
  const pathname = usePathname()

  useEffect(() => {
    // Only capture on first visit — don't overwrite existing attribution
    if (localStorage.getItem(STORAGE_KEY)) return

    const utmSource = searchParams.get('utm_source')
    const referrer = document.referrer || null

    // Nothing useful to store
    if (!utmSource && !referrer) return

    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      utmSource,
      utmMedium: searchParams.get('utm_medium'),
      utmCampaign: searchParams.get('utm_campaign'),
      utmContent: searchParams.get('utm_content'),
      utmTerm: searchParams.get('utm_term'),
      referrer,
      landingPage: pathname,
    }))
  }, [searchParams, pathname])

  return null
}

export function UtmCapture() {
  return (
    <Suspense>
      <UtmCaptureInner />
    </Suspense>
  )
}
