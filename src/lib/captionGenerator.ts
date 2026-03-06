/**
 * AI Caption Generator for Instagram Posts
 *
 * Uses video transcripts (from Whisper) to generate engaging
 * Instagram captions with hooks, CTAs, and hashtags.
 */

import OpenAI from 'openai';
import { prisma } from './db';
import { logger } from './logger';

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }
  return new OpenAI({ apiKey });
}

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

  const prompt = `You write Instagram captions that sound like a real person typed them on their phone — not a marketing agency.

Here's the transcript of a video someone just recorded:

---
${transcript.slice(0, 3000)}
---
${videoTitle ? `\nVideo title: "${videoTitle}"` : ''}

Their vibe: ${brandVoice}
What they talk about: ${niche}
Style: ${captionStyle}

Write a caption that sounds like THEM, not like an AI. Follow these rules strictly:

VOICE & TONE:
- Write like you're texting a friend who's interested in this topic
- Use the same words and phrases they used in the transcript — mirror their vocabulary
- NO generic motivational filler ("In today's fast-paced world...", "Here's the thing...", "Let me break this down...")
- NO corporate buzzwords ("leverage", "optimize", "game-changer", "unlock", "elevate")
- NO emoji spam — use 0-2 emojis MAX, only if it fits naturally
- Imperfect grammar is fine if it matches how they talk. Fragments are good. Start sentences with "And" or "But"
- Be specific — use actual numbers, names, or details from the transcript

STRUCTURE:
- First line: a short, punchy opener under 125 chars (this shows before "...more"). NOT a question unless the speaker actually asked one. NOT clickbait. Just the most interesting specific thing from the video
- Body: 1-3 short paragraphs. Get to the point. Say what they said in the video but shorter. Don't pad it
- Keep it under 800 characters for the hook+body (people don't read long captions)${ctaSection}
- ${hashtagCount} hashtags (mix niche + broad). Put them at the bottom after dot separators${customHashtagSection}

THINGS TO AVOID:
- Starting with "Ever wondered..." or any rhetorical question opener
- "Here's what nobody tells you about..."
- Listicles in the caption body (save that for carousels)
- Overly polished sentences — this should feel dashed off, not workshopped
- Making claims they didn't make in the transcript
- Adding context or opinions they didn't express${exampleSection}

Return ONLY valid JSON (no markdown, no code fences):
{
  "hook": "the opener line",
  "body": "caption body with \\n line breaks between paragraphs",
  "cta": "call to action or empty string",
  "hashtags": ["hashtag1", "hashtag2"],
  "altText": "brief video description for accessibility"
}`;

  try {
    const completion = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
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
