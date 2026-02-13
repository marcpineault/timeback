'use client';

import { useState, useEffect, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────

export interface CreatorProfile {
  id: string;
  niche: string;
  targetAudience: string;
  contentGoal: string;
  statusProof: string[];
  powerExamples: string[];
  credibilityMarkers: string[];
  likenessTraits: string[];
  toneOfVoice: string;
  personalCatchphrases: string[];
  avoidTopics: string[];
  exampleScripts: string[];
  primaryPlatform: string;
  typicalVideoLength: number;
  isComplete: boolean;
}

export interface IdeaData {
  id: string;
  title: string;
  hook: string;
  hookVariations: string[];
  angle: string;
  contentType: 'reach' | 'authority' | 'conversion' | null;
  engagementPlay: 'saves' | 'shares' | 'comments' | 'follows' | null;
  spclElements: {
    status: string;
    power: string;
    credibility: string;
    likeness: string;
  };
  targetEmotion: string;
  estimatedLength: number;
  status: 'SAVED' | 'SCRIPTED' | 'FILMED' | 'ARCHIVED';
  createdAt: string;
}

export interface ScriptData {
  id: string;
  ideaId: string | null;
  title: string;
  hook: string;
  body: string;
  cta: string;
  fullScript: string;
  estimatedDuration: number;
  wordCount: number;
  spclBreakdown: {
    status: string;
    power: string;
    credibility: string;
    likeness: string;
  } | null;
  isEdited: boolean;
  version: number;
  rating: string | null;
  status: 'DRAFT' | 'READY' | 'FILMED' | 'ARCHIVED';
  createdAt: string;
  idea?: { title: string; hook?: string } | null;
}

// ─── Creator Profile ─────────────────────────────────────────────────

export function useCreatorProfile() {
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/ideate/profile');
      if (res.ok) {
        const data = await res.json();
        setProfile(data.profile);
      }
    } catch (err) {
      console.error('Failed to fetch creator profile:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return { profile, loading, refetch: fetchProfile };
}

// ─── Ideas ───────────────────────────────────────────────────────────

export function useIdeas(statusFilter?: string) {
  const [ideas, setIdeas] = useState<IdeaData[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchIdeas = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/ideate/ideas?${params}`);
      if (res.ok) {
        const data = await res.json();
        setIdeas(data.ideas);
        setTotal(data.total);
      }
    } catch (err) {
      console.error('Failed to fetch ideas:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchIdeas();
  }, [fetchIdeas]);

  return { ideas, total, loading, refetch: fetchIdeas };
}

// ─── Scripts ─────────────────────────────────────────────────────────

export function useScripts(filters?: { status?: string; ideaId?: string }) {
  const [scripts, setScripts] = useState<ScriptData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchScripts = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filters?.status) params.set('status', filters.status);
      if (filters?.ideaId) params.set('ideaId', filters.ideaId);
      const res = await fetch(`/api/ideate/scripts?${params}`);
      if (res.ok) {
        const data = await res.json();
        setScripts(data.scripts);
      }
    } catch (err) {
      console.error('Failed to fetch scripts:', err);
    } finally {
      setLoading(false);
    }
  }, [filters?.status, filters?.ideaId]);

  useEffect(() => {
    fetchScripts();
  }, [fetchScripts]);

  return { scripts, loading, refetch: fetchScripts };
}

// ─── Single Script ───────────────────────────────────────────────────

export function useScript(scriptId: string | null) {
  const [script, setScript] = useState<ScriptData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchScript = useCallback(async () => {
    if (!scriptId) {
      setScript(null);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/ideate/scripts/${scriptId}`);
      if (res.ok) {
        const data = await res.json();
        setScript(data.script);
      }
    } catch (err) {
      console.error('Failed to fetch script:', err);
    } finally {
      setLoading(false);
    }
  }, [scriptId]);

  useEffect(() => {
    fetchScript();
  }, [fetchScript]);

  return { script, loading, refetch: fetchScript };
}

// ─── Rate Script ─────────────────────────────────────────────────────

export async function rateScript(
  scriptId: string,
  rating: 'up' | 'down' | null
): Promise<boolean> {
  try {
    const res = await fetch(`/api/ideate/scripts/${scriptId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating }),
    });
    return res.ok;
  } catch (err) {
    console.error('Failed to rate script:', err);
    return false;
  }
}
