/**
 * Top Videos Analyzer
 *
 * Uses Claude to analyze Instagram video captions from top-performing
 * content, extracting hooks, patterns, and generating adapted versions
 * personalized to the user's SPCL creator profile.
 */

import Anthropic from '@anthropic-ai/sdk';
import { buildCreatorPrompt, type CreatorContext } from './scriptGenerator';
import { logger } from './logger';
import type { InstagramMedia } from './instagramResearch';

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    throw new Error('CLAUDE_API_KEY environment variable is not set');
  }
  return new Anthropic({ apiKey });
}

// ─── Types ───────────────────────────────────────────────────────────

export interface AnalyzedVideo {
  // Passthrough from Instagram data
  igMediaId: string;
  permalink: string;
  caption: string;
  mediaType: string;
  likeCount: number;
  commentsCount: number;
  videoTimestamp: string | null;
  creatorUsername: string | null;
  creatorFollowers: number | null;

  // AI analysis
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
}

// ─── Analyzer ────────────────────────────────────────────────────────

export async function analyzeTopVideos(
  videos: InstagramMedia[],
  creatorContext: CreatorContext,
  creatorUsername?: string | null,
  creatorFollowers?: number | null
): Promise<AnalyzedVideo[]> {
  if (videos.length === 0) return [];

  const anthropic = getAnthropicClient();
  const creatorPrompt = buildCreatorPrompt(creatorContext);

  // Build the captions list for analysis
  const captionsList = videos
    .map((v, i) => {
      const engagement = (v.like_count || 0) + (v.comments_count || 0);
      return `--- VIDEO ${i + 1} ---
Caption: ${v.caption || '(no caption)'}
Likes: ${v.like_count || 0} | Comments: ${v.comments_count || 0} | Total Engagement: ${engagement}
Posted: ${v.timestamp || 'unknown'}
Permalink: ${v.permalink}`;
    })
    .join('\n\n');

  const systemPrompt = `You are an expert short-form video content analyst specializing in Instagram Reels.
Your job is to analyze top-performing video captions, extract the hooks and patterns that make them
successful, and help creators adapt these proven patterns for their own content.

${creatorPrompt}

IMPORTANT RULES:
- Extract the HOOK from each caption — this is the first 1-2 lines that stop the scroll
- If the caption is empty or very short, infer the likely spoken hook from context
- Identify the specific HOOK FORMULA used (curiosity gap, bold claim, pattern interrupt, etc.)
- Score hook strength from 1-10 based on scroll-stopping power
- Generate ADAPTED hooks that use the same formula but are personalized to the creator's niche,
  audience, and voice — make them ready to use, not generic templates
- Be specific and actionable in your analysis`;

  const userPrompt = `Analyze these top-performing Instagram Reels and extract their hook patterns.
For each video, provide a detailed breakdown.

${captionsList}

Respond with a JSON array (no markdown, no code fences — raw JSON only).
Each element must have these exact fields:

[
  {
    "videoIndex": 0,
    "hook": "The extracted hook (first 1-2 lines of caption or inferred spoken hook)",
    "hookFormula": "Name of the hook formula (e.g. 'Curiosity Gap', 'Bold Claim', 'Pattern Interrupt', 'Story Open', 'Data Shock', 'Controversy', 'Value Promise')",
    "hookAnalysis": "Why this hook works — what psychological trigger it uses and what makes it effective",
    "hookStrength": 8,
    "contentStructure": "Brief description of the content structure (e.g. 'Hook → Story → Lesson → CTA')",
    "viralPattern": "The viral pattern at play (e.g. 'Relatable struggle', 'Transformation reveal', 'Expert authority')",
    "whyItWorks": "2-3 sentences explaining why this video performs well — consider the hook, content, and engagement drivers",
    "targetEmotion": "Primary emotion targeted (e.g. 'curiosity', 'aspiration', 'fear of missing out', 'relatability')",
    "engagementDriver": "What drives engagement (e.g. 'saves for reference', 'shares for relatability', 'comments for debate')",
    "adaptedHook": "A ready-to-use hook adapted to the creator's niche and voice, using the same formula",
    "adaptedHookVariations": ["variation 1", "variation 2", "variation 3"],
    "adaptationNotes": "How the hook was adapted and what to keep in mind when filming",
    "tags": ["tag1", "tag2", "tag3"],
    "contentType": "reach or authority or conversion",
    "format": "The video format (e.g. 'talking head', 'voiceover', 'text overlay', 'day in the life')"
  }
]

Return exactly ${videos.length} objects, one per video, in order. videoIndex is 0-based.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [
      { role: 'user', content: userPrompt },
    ],
    system: systemPrompt,
  });

  // Extract the text response
  const textContent = response.content.find((c) => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  let analyses: Array<{
    videoIndex: number;
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
  }>;

  try {
    // Handle potential markdown code fences
    let jsonStr = textContent.text.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    analyses = JSON.parse(jsonStr);
  } catch (e) {
    logger.error('Failed to parse Claude analysis response', { text: textContent.text.slice(0, 500), error: e });
    throw new Error('Failed to parse video analysis results');
  }

  // Map analysis results back to video data
  return videos.map((video, i) => {
    const analysis = analyses.find((a) => a.videoIndex === i) || analyses[i];

    return {
      igMediaId: video.id,
      permalink: video.permalink,
      caption: video.caption || '',
      mediaType: video.media_type,
      likeCount: video.like_count || 0,
      commentsCount: video.comments_count || 0,
      videoTimestamp: video.timestamp || null,
      creatorUsername: creatorUsername || null,
      creatorFollowers: creatorFollowers || null,

      hook: analysis?.hook || '',
      hookFormula: analysis?.hookFormula || '',
      hookAnalysis: analysis?.hookAnalysis || '',
      hookStrength: Math.min(10, Math.max(1, analysis?.hookStrength || 5)),
      contentStructure: analysis?.contentStructure || '',
      viralPattern: analysis?.viralPattern || '',
      whyItWorks: analysis?.whyItWorks || '',
      targetEmotion: analysis?.targetEmotion || '',
      engagementDriver: analysis?.engagementDriver || '',
      adaptedHook: analysis?.adaptedHook || '',
      adaptedHookVariations: analysis?.adaptedHookVariations || [],
      adaptationNotes: analysis?.adaptationNotes || '',
      tags: analysis?.tags || [],
      contentType: analysis?.contentType || '',
      format: analysis?.format || '',
    };
  });
}
