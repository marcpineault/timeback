'use client'

import { useState, useEffect, useCallback } from 'react'

export interface InstagramAccount {
  id: string
  instagramUserId: string
  instagramUsername: string
  instagramProfilePic: string | null
  facebookPageName: string | null
  isActive: boolean
  lastPublishedAt: string | null
  lastError: string | null
  tokenExpiresAt: string
  createdAt: string
}

export interface ScheduleSlot {
  id: string
  dayOfWeek: number
  timeOfDay: string
  timezone: string
  isActive: boolean
  instagramAccount?: { instagramUsername: string }
}

export interface ScheduledPostData {
  id: string
  caption: string
  captionGenerated: boolean
  hashtags: string[]
  scheduledFor: string
  publishedAt: string | null
  status: string
  igPermalink: string | null
  coverImageUrl: string | null
  video: {
    id: string
    originalName: string
    processedUrl: string | null
    status: string
  }
  instagramAccount: {
    id: string
    instagramUsername: string
    instagramProfilePic: string | null
  }
}

export interface QueueStats {
  scheduled: number
  published: number
  failed: number
  nextPostAt: string | null
}

export function useInstagramAccounts() {
  const [accounts, setAccounts] = useState<InstagramAccount[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/instagram/accounts')
      if (res.ok) {
        const data = await res.json()
        setAccounts(data.accounts)
      }
    } catch (err) {
      console.error('Failed to fetch Instagram accounts:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAccounts() }, [fetchAccounts])

  return { accounts, loading, refetch: fetchAccounts }
}

export function useScheduleSlots() {
  const [slots, setSlots] = useState<ScheduleSlot[]>([])
  const [loading, setLoading] = useState(true)

  const fetchSlots = useCallback(async () => {
    try {
      const res = await fetch('/api/schedule/slots')
      if (res.ok) {
        const data = await res.json()
        setSlots(data.slots)
      }
    } catch (err) {
      console.error('Failed to fetch schedule slots:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSlots() }, [fetchSlots])

  return { slots, loading, refetch: fetchSlots }
}

export function usePostingQueue() {
  const [queue, setQueue] = useState<ScheduledPostData[]>([])
  const [stats, setStats] = useState<QueueStats | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch('/api/schedule/queue')
      if (res.ok) {
        const data = await res.json()
        setQueue(data.queue)
        setStats(data.stats)
      }
    } catch (err) {
      console.error('Failed to fetch queue:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchQueue() }, [fetchQueue])

  return { queue, stats, loading, refetch: fetchQueue }
}
