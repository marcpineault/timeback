/**
 * Swipe File Generator
 *
 * Uses Claude to generate swipe file entries — proven hooks, body structures ("meat"),
 * and CTAs from viral content patterns in the creator's niche. Entries are based on
 * Claude's deep knowledge of viral content, not scraped from specific URLs.
 */

import Anthropic from '@anthropic-ai/sdk';
import { buildCreatorPrompt, type CreatorContext } from './scriptGenerator';
import { logger } from './logger';

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    throw new Error('CLAUDE_API_KEY environment variable is not set');
  }
  return new Anthropic({ apiKey });
}

// ─── Types ───────────────────────────────────────────────────────────

export interface GeneratedSwipeEntry {
  hook: string;
  meat: string;
  cta: string;
  fullExample: string;
  analysis: string;
  source: string;
  category: 'HOOK' | 'MEAT' | 'CTA' | 'FULL';
  format: string;
  tags: string[];
}

// ─── Category-Specific Instructions ─────────────────────────────────

const CATEGORY_INSTRUCTIONS: Record<string, string> = {
  HOOK: `Focus on HOOKS — the first 3-5 seconds of a video that stop the scroll.
Generate diverse hook styles using PROVEN psychological triggers:
- News-style headline (recency: "I just found...", conflict: "Why X is killing your Y", relevancy: "If you're a [audience], stop scrolling", unusualness: "The weird reason...")
- Pattern interrupt ("Stop doing X right now...")
- Curiosity gap ("Nobody talks about this one thing...")
- Bold claim with proof ("I made $X in Y days — here's exactly how")
- Controversy ("Unpopular opinion: X is dead and here's the data")
- Story open ("Last week something happened that changed everything...")
- Data shock ("97% of people get this wrong — and it's costing them...")
- Value promise ("In the next 30 seconds, I'll show you the exact system for X")
- Open loop ("I was about to quit my business — until I discovered this one thing..." — teases without revealing)

For each entry, the "hook" field should be the PRIMARY focus — a ready-to-use opening line.
The "analysis" field should explain the EFFECT ON VIEWER — what psychological trigger makes this hook work and what emotion/action it drives.
The "meat" and "cta" fields should show how this hook style naturally flows into content.`,

  MEAT: `Focus on BODY STRUCTURES (the "meat") — the main content delivery framework.
Generate diverse body frameworks:
- Step-by-step ("Here's my 3-step process...")
- Problem-Agitate-Solve ("The problem is X. And it gets worse because Y. Here's the fix...")
- Story arc (setup → conflict → resolution → lesson)
- Myth-busting ("Everyone says X. But actually...")
- Before/After ("I used to X. Then I discovered Y. Now I Z.")
- Case study ("My client did X and here's what happened...")

For each entry, the "meat" field should be the PRIMARY focus — a complete body framework.
The "hook" and "cta" should show what naturally leads into and out of this structure.`,

  CTA: `Focus on CALLS TO ACTION — the closing that drives engagement and conversion.
Generate diverse CTA styles:
- Soft ask ("If this helped, save it for later")
- Hard sell ("Link in bio — spots are limited")
- Bridge CTA ("Part 2 drops tomorrow — follow so you don't miss it")
- Social proof ("Join the 10,000+ people who already...")
- Scarcity ("I'm only taking 5 more clients this month")
- Identity ("If you're the type of person who X, then Y")
- Reciprocity ("I just gave you my entire framework for free — all I ask is...")

For each entry, the "cta" field should be the PRIMARY focus — a ready-to-use closing.
The "hook" and "meat" should show what naturally precedes this CTA style.`,

  FULL: `Generate COMPLETE video scripts where hook, meat, and CTA work together as a cohesive unit.
Each entry should use a DIFFERENT proven viral format:
- "Hook → Story → Takeaway" (open with curiosity, tell a brief story, end with one clear lesson)
- "Contrarian Take" (challenge common belief → evidence → reframe the viewer's understanding)
- "Before/After Transformation" (paint the pain → show the result → reveal the bridge)
- "The Myth Buster" (state common mistake → explain why it persists → correct approach)
- "Step-by-Step Value Stack" (promise outcome → deliver numbered steps → save CTA)
- "Behind the Numbers" (surprising result → break down how it happened → invite them in)
- "Day in the Life + Lesson" (show an authentic moment → extract a business/life insight)
- "The Unexpected Expert" (unusual angle into a topic → prove credibility through story → deliver insight)

Each entry should name which format it uses in the "source" field.
All three sections should be equally detailed and work together.`,
};

// ─── Generator ──────────────────────────────────────────────────────

export async function generateSwipeEntries(
  creatorContext: CreatorContext,
  userId: string,
  category?: string,
  topic?: string,
  count: number = 5
): Promise<GeneratedSwipeEntry[]> {
  const categoryFilter = category && CATEGORY_INSTRUCTIONS[category] ? category : null;
  const categoryInstruction = categoryFilter
    ? CATEGORY_INSTRUCTIONS[categoryFilter]
    : 'Generate a MIX of entries — some focused on hooks, some on body structures, some on CTAs, and some complete scripts.';

  const prompt = `You are a viral video content analyst with deep expertise in short-form video content that gets millions of views. You study patterns across TikTok, Instagram Reels, YouTube Shorts, and other platforms.

Your job is to generate an "inspiration file" — a collection of proven content patterns, frameworks, and examples that a creator can draw inspiration from.

${buildCreatorPrompt(creatorContext)}

NICHE FOCUS: ${creatorContext.niche}
${topic ? `TOPIC FOCUS: ${topic}` : ''}

${categoryInstruction}

Generate ${count} inspiration entries. Each entry should:
1. Be based on PROVEN viral content patterns you've observed across millions of videos
2. Be ADAPTED to the creator's specific niche and audience
3. Include "Effect on Viewer" analysis — explain the SPECIFIC psychological mechanism (cognitive bias, emotional trigger, or behavioral pattern) that makes this work. Name the bias/trigger explicitly (e.g., "curiosity gap," "loss aversion," "social proof," "authority bias").
4. Be directly usable — the creator could film this today
5. Include the source pattern type (what viral format it's modeled after)

Return ONLY valid JSON array (no markdown, no code fences):
[
  {
    "hook": "exact opening line ready to say on camera",
    "meat": "the body/main content structure with key points and transitions",
    "cta": "the closing call to action",
    "fullExample": "the complete script combining all three sections as one continuous read",
    "analysis": "EFFECT ON VIEWER: 2-3 sentences explaining the specific psychological mechanism — name the cognitive bias or emotional trigger (e.g., curiosity gap, loss aversion, social proof, authority bias) and explain how it drives the viewer to watch, save, share, or follow",
    "source": "the viral content pattern this models (e.g., 'Curiosity Gap + Authority Stack', 'Story Loop + Problem-Agitate-Solve')",
    "category": "${categoryFilter || 'FULL'}",
    "format": "the video format (e.g., 'direct-to-camera', 'talking-head with text overlay', 'story time', 'tutorial walkthrough')",
    "tags": ["3-5 descriptive tags"]
  }
]

${!categoryFilter ? 'Assign the most appropriate category to each: "HOOK" if the hook is the standout element, "MEAT" if the body framework is the focus, "CTA" if the closing is the highlight, or "FULL" if all three work equally well together.' : ''}

IMPORTANT: Make each entry DISTINCT — different patterns, different psychological triggers, different formats. No two entries should feel similar.`;

  logger.debug(`[SwipeFileGenerator] Generating ${count} entries for user ${userId} (category: ${categoryFilter || 'ALL'})`);

  try {
    const message = await getAnthropicClient().messages.create({
      model: 'claude-opus-4-6-20260204',
      max_tokens: 8192,
      temperature: 0.9,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
    const jsonStr = raw.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
    const entries: GeneratedSwipeEntry[] = JSON.parse(jsonStr);

    // Ensure category is set correctly when filtered
    if (categoryFilter) {
      for (const entry of entries) {
        entry.category = categoryFilter as GeneratedSwipeEntry['category'];
      }
    }

    logger.debug(`[SwipeFileGenerator] Generated ${entries.length} entries`);
    return entries;
  } catch (error) {
    logger.error('[SwipeFileGenerator] Failed to generate swipe entries', {
      error: error instanceof Error ? { message: error.message } : error,
      userId,
    });
    throw new Error('Failed to generate swipe file entries');
  }
}
