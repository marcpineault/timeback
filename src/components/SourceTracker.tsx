'use client'

import { useEffect } from 'react'
import { useUser } from '@clerk/nextjs'

const STORAGE_KEY = 'tb_attribution'

export function SourceTracker() {
  const { isSignedIn } = useUser()

  useEffect(() => {
    if (!isSignedIn) return

    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return

    let attribution: Record<string, string | null>
    try {
      attribution = JSON.parse(raw)
    } catch {
      localStorage.removeItem(STORAGE_KEY)
      return
    }

    fetch('/api/user/source', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(attribution),
    })
      .then(res => {
        if (res.ok) localStorage.removeItem(STORAGE_KEY)
      })
      .catch(() => {
        // Silently fail — will retry next session
      })
  }, [isSignedIn])

  return null
}
