'use client';

import { useState, useEffect, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────

export interface TopVideoData {
  id: string;
  permalink: string;
  caption: string;
  mediaType: string;
  likeCount: number;
  commentsCount: number;
  videoTimestamp: string | null;
  creatorUsername: string | null;
  creatorFollowers: number | null;

  hook: string;
  hookFormula: string;
  hookAnalysis: string;
  hookStrength: number;
  contentStructure: string;
  viralPattern: string;
  whyItWorks: string;
  targetEmotion: string;
  engagementDriver: string;
  adaptedHook: string;
  adaptedHookVariations: string[];
  adaptationNotes: string;
  tags: string[];
  contentType: string;
  format: string;

  isSaved: boolean;
  isUsedAsIdea: boolean;
  createdAt: string;

  search: {
    id: string;
    searchType: string;
    query: string;
    creatorUsername: string | null;
    creatorFollowers: number | null;
    createdAt: string;
  };
}

// ─── Top Videos List ─────────────────────────────────────────────────

export function useTopVideos(filters?: { saved?: boolean; searchType?: string }) {
  const [videos, setVideos] = useState<TopVideoData[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchVideos = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filters?.saved) params.set('saved', 'true');
      if (filters?.searchType) params.set('searchType', filters.searchType);
      const res = await fetch(`/api/ideate/research?${params}`);
      if (res.ok) {
        const data = await res.json();
        setVideos(data.videos);
        setTotal(data.total);
      }
    } catch (err) {
      console.error('Failed to fetch research videos:', err);
    } finally {
      setLoading(false);
    }
  }, [filters?.saved, filters?.searchType]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  return { videos, total, loading, refetch: fetchVideos };
}

// ─── Toggle Save ────────────────────────────────────────────────────

export async function toggleTopVideoSave(
  videoId: string,
  isSaved: boolean
): Promise<boolean> {
  try {
    const res = await fetch(`/api/ideate/research/${videoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isSaved }),
    });
    return res.ok;
  } catch (err) {
    console.error('Failed to toggle video save:', err);
    return false;
  }
}
