/**
 * AI Caption Generator for Instagram Posts
 *
 * Uses video transcripts (from Whisper) to generate engaging
 * Instagram captions with hooks, CTAs, and hashtags.
 */

import OpenAI from 'openai';
import { prisma } from './db';
import { logger } from './logger';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface GeneratedCaption {
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
  altText: string;
  fullCaption: string; // Combined hook + body + cta + hashtags
}

export interface CaptionGenerationInput {
  transcript: string;
  userId: string;
  videoTitle?: string;
}

/**
 * Generate an Instagram caption from a video transcript.
 * Uses the user's caption preferences for brand voice, style, etc.
 */
export async function generateCaption(input: CaptionGenerationInput): Promise<GeneratedCaption> {
  const { transcript, userId, videoTitle } = input;

  // Fetch user's caption preferences
  const preferences = await prisma.captionPreferences.findUnique({
    where: { userId },
  });

  const brandVoice = preferences?.brandVoice || 'casual';
  const niche = preferences?.niche || 'content creation';
  const captionStyle = preferences?.captionStyle || 'hook-based';
  const hashtagCount = preferences?.hashtagCount || 25;
  const defaultCTA = preferences?.defaultCTA || '';
  const includeCTA = preferences?.includeCTA ?? true;
  const customHashtags = preferences?.customHashtags || [];
  const blockedHashtags = new Set((preferences?.blockedHashtags || []).map((h) => h.toLowerCase()));
  const exampleCaptions = preferences?.exampleCaptions || [];

  const exampleSection =
    exampleCaptions.length > 0
      ? `\n\nHere are examples of captions the user likes (match this style):\n${exampleCaptions
          .slice(0, 3)
          .map((c, i) => `Example ${i + 1}: "${c}"`)
          .join('\n')}`
      : '';

  const customHashtagSection =
    customHashtags.length > 0
      ? `\nAlways include these hashtags: ${customHashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ')}`
      : '';

  const ctaSection = includeCTA
    ? `\n- Include a clear CTA at the end${defaultCTA ? ` (preferred CTA: "${defaultCTA}")` : ''}`
    : '\n- Do NOT include a call-to-action';

  const prompt = `You are a social media copywriter specializing in Instagram.
Write an engaging Instagram caption for a video with this transcript:

---
${transcript.slice(0, 3000)}
---
${videoTitle ? `\nVideo title: "${videoTitle}"` : ''}

Brand voice: ${brandVoice}
Niche: ${niche}
Caption style: ${captionStyle}

Requirements:
- First line must be a scroll-stopping hook (under 125 characters, this appears before "...more")
- Body should provide value or context (2-4 short paragraphs)${ctaSection}
- Generate ${hashtagCount} relevant hashtags (mix of high-volume and niche-specific)${customHashtagSection}
- Keep total caption under 2,200 characters (Instagram limit)
- Use line breaks between sections for readability
- Match the tone and energy of the video content${exampleSection}

Return ONLY valid JSON (no markdown, no code fences):
{
  "hook": "the scroll-stopping first line",
  "body": "the main caption body with line breaks",
  "cta": "the call to action line (empty string if no CTA)",
  "hashtags": ["hashtag1", "hashtag2"],
  "altText": "brief description of video content for accessibility"
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
      max_tokens: 1500,
    });

    const raw = completion.choices[0]?.message?.content?.trim() || '';

    // Parse the JSON response (handle potential markdown wrapping)
    const jsonStr = raw.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(jsonStr);

    // Filter out blocked hashtags
    const hashtags: string[] = (parsed.hashtags || [])
      .map((h: string) => h.replace(/^#/, '').toLowerCase())
      .filter((h: string) => !blockedHashtags.has(h));

    // Build the full caption
    const hashtagString = hashtags.map((h: string) => `#${h}`).join(' ');
    const parts = [parsed.hook, '', parsed.body];
    if (parsed.cta) {
      parts.push('', parsed.cta);
    }
    parts.push('', '.', '.', '.', '', hashtagString);

    const fullCaption = parts.join('\n').slice(0, 2200); // Instagram limit

    return {
      hook: parsed.hook || '',
      body: parsed.body || '',
      cta: parsed.cta || '',
      hashtags,
      altText: parsed.altText || '',
      fullCaption,
    };
  } catch (error) {
    logger.error('Failed to generate caption', { error, userId });
    throw new Error('Failed to generate Instagram caption');
  }
}

/**
 * Regenerate a caption with a different style override.
 */
export async function regenerateCaption(
  input: CaptionGenerationInput & { styleOverride?: string }
): Promise<GeneratedCaption> {
  // For regeneration, we just call generate with the same input
  // The AI's temperature ensures variety
  return generateCaption(input);
}
