'use client';

import { useState, useEffect, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────

export interface SwipeEntryData {
  id: string;
  hook: string;
  meat: string;
  cta: string;
  fullExample: string;
  analysis: string;
  source: string;
  category: 'HOOK' | 'MEAT' | 'CTA' | 'FULL';
  format: string;
  niche: string;
  tags: string[];
  isSaved: boolean;
  createdAt: string;
}

// ─── Swipe Entries ──────────────────────────────────────────────────

export function useSwipeEntries(filters?: { category?: string; saved?: boolean }) {
  const [entries, setEntries] = useState<SwipeEntryData[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchEntries = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filters?.category) params.set('category', filters.category);
      if (filters?.saved) params.set('saved', 'true');
      const res = await fetch(`/api/ideate/swipefile?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries);
        setTotal(data.total);
      }
    } catch (err) {
      console.error('Failed to fetch swipe entries:', err);
    } finally {
      setLoading(false);
    }
  }, [filters?.category, filters?.saved]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  return { entries, total, loading, refetch: fetchEntries };
}

// ─── Toggle Save ────────────────────────────────────────────────────

export async function toggleSwipeSave(
  entryId: string,
  isSaved: boolean
): Promise<boolean> {
  try {
    const res = await fetch(`/api/ideate/swipefile/${entryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isSaved }),
    });
    return res.ok;
  } catch (err) {
    console.error('Failed to toggle swipe save:', err);
    return false;
  }
}
