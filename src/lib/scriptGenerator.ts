/**
 * AI Script Generator for Video Content
 *
 * Uses Claude to generate video ideas and teleprompter-ready scripts
 * based on the creator's SPCL profile (Status, Power, Credibility, Likeness).
 * Learns from user ratings and edit patterns over time.
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

// ─── Types ───────────────────────────────────────────────────────────

export interface CreatorContext {
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
}

export interface GeneratedIdea {
  title: string;
  hook: string;
  hookVariations: string[];
  angle: string;
  contentType: 'reach' | 'authority' | 'conversion';
  engagementPlay: 'saves' | 'shares' | 'comments' | 'follows';
  spclElements: {
    status: string;
    power: string;
    credibility: string;
    likeness: string;
  };
  targetEmotion: string;
  estimatedLength: number;
}

export interface GeneratedScript {
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
  };
}

interface LearningContext {
  topRatedScripts: { fullScript: string }[];
  dislikedScripts: { fullScript: string }[];
  editedScripts: { originalFullScript: string; editedFullScript: string }[];
}

// ─── Learning Context ────────────────────────────────────────────────

/**
 * Fetch the user's learning context from past script ratings and edits.
 */
async function getLearningContext(userId: string): Promise<LearningContext> {
  const [topRated, disliked, edited] = await Promise.all([
    prisma.script.findMany({
      where: { userId, rating: 'up' },
      orderBy: { updatedAt: 'desc' },
      take: 3,
      select: { fullScript: true },
    }),
    prisma.script.findMany({
      where: { userId, rating: 'down' },
      orderBy: { updatedAt: 'desc' },
      take: 2,
      select: { fullScript: true },
    }),
    prisma.script.findMany({
      where: {
        userId,
        isEdited: true,
        originalFullScript: { not: null },
      },
      orderBy: { updatedAt: 'desc' },
      take: 3,
      select: { originalFullScript: true, fullScript: true },
    }),
  ]);

  return {
    topRatedScripts: topRated,
    dislikedScripts: disliked,
    editedScripts: edited.map((s) => ({
      originalFullScript: s.originalFullScript!,
      editedFullScript: s.fullScript,
    })),
  };
}

/**
 * Build the learning context section for AI prompts.
 */
function buildLearningPrompt(learning: LearningContext): string {
  const sections: string[] = [];

  if (learning.topRatedScripts.length > 0) {
    sections.push(
      `Scripts the creator rated highly (match this style and energy):\n${learning.topRatedScripts
        .map((s, i) => `${i + 1}. "${s.fullScript.slice(0, 800)}"`)
        .join('\n')}`
    );
  }

  if (learning.dislikedScripts.length > 0) {
    sections.push(
      `Scripts the creator didn't like (avoid this approach):\n${learning.dislikedScripts
        .map((s, i) => `${i + 1}. "${s.fullScript.slice(0, 500)}"`)
        .join('\n')}`
    );
  }

  if (learning.editedScripts.length > 0) {
    sections.push(
      `How the creator edits AI scripts (learn from their changes):\n${learning.editedScripts
        .map(
          (s, i) =>
            `Edit ${i + 1}:\nOriginal: "${s.originalFullScript.slice(0, 600)}"\nCreator's version: "${s.editedFullScript.slice(0, 600)}"`
        )
        .join('\n\n')}`
    );
  }

  if (sections.length === 0) return '';

  return `\n\nLEARNING FROM PAST SCRIPTS:\n\n${sections.join('\n\n')}\n\nUse these examples to calibrate your voice, length, structure, and content choices.`;
}

// ─── Creator Profile Prompt ──────────────────────────────────────────

export function buildCreatorPrompt(ctx: CreatorContext): string {
  const parts = [
    `CREATOR PROFILE:`,
    `- Niche: ${ctx.niche}`,
    `- Target audience: ${ctx.targetAudience}`,
    `- Content goal: ${ctx.contentGoal}`,
    `- Voice/tone: ${ctx.toneOfVoice}`,
    `- Platform: ${ctx.primaryPlatform}`,
    `- Target video length: ${ctx.typicalVideoLength} seconds`,
  ];

  if (ctx.statusProof.length > 0) {
    parts.push(`\nSTATUS PROOF (scarce resources they control):\n${ctx.statusProof.map((s) => `- ${s}`).join('\n')}`);
  }

  if (ctx.powerExamples.length > 0) {
    parts.push(
      `\nPOWER (frameworks/advice they teach that leads to results):\n${ctx.powerExamples.map((s) => `- ${s}`).join('\n')}`
    );
  }

  if (ctx.credibilityMarkers.length > 0) {
    parts.push(
      `\nCREDIBILITY (third-party validation):\n${ctx.credibilityMarkers.map((s) => `- ${s}`).join('\n')}`
    );
  }

  if (ctx.likenessTraits.length > 0) {
    parts.push(
      `\nLIKENESS (relatable/authentic traits):\n${ctx.likenessTraits.map((s) => `- ${s}`).join('\n')}`
    );
  }

  if (ctx.personalCatchphrases.length > 0) {
    parts.push(`\nCATCHPHRASES: ${ctx.personalCatchphrases.join(', ')}`);
  }

  if (ctx.avoidTopics.length > 0) {
    parts.push(`\nTOPICS TO AVOID: ${ctx.avoidTopics.join(', ')}`);
  }

  return parts.join('\n');
}

// ─── Platform Intelligence ──────────────────────────────────────────

function buildPlatformPrompt(platform: string): string {
  const platformGuides: Record<string, string> = {
    'tiktok': `PLATFORM: TikTok
- Hook MUST be under 8 words. The first 1 second decides everything.
- Favor controversy, hot takes, and pattern interrupts — these stop the scroll
- Design for duets/stitches (leave room for reactions)
- Comments drive the algorithm — create comment-bait ("Am I wrong?", "What would you do?")
- Optimal length: 30-60 seconds for most niches
- Saves and shares weight heavily — make content screenshot-worthy or send-worthy`,

    'instagram': `PLATFORM: Instagram Reels
- Saves are the #1 algorithm signal. Create save-worthy educational content.
- Share triggers work extremely well ("Send this to someone who...")
- Slightly more polished than TikTok — aesthetic matters but authenticity wins
- Hook can be 10-12 words but must stop the scroll in the first 1-2 seconds
- Optimal length: 30-90 seconds
- Carousel-adjacent value (content worth saving for later) outperforms entertainment-only`,

    'youtube-shorts': `PLATFORM: YouTube Shorts
- Searchability matters more than other platforms — title should match search intent
- Curiosity gaps perform better than controversy on YouTube
- Watch time is weighted HEAVILY — build in retention hooks throughout
- Longer content (60-90s) works well because YouTube favors total watch time
- Subscribers matter more — use strategic follow CTAs
- Pattern interrupts every 8-10 seconds minimum to maintain retention`,

    'youtube': `PLATFORM: YouTube (long form)
- Cold open must hook in the first 10 seconds — NO intros, logos, or "hey guys"
- Promise a specific outcome in the first 30 seconds
- Use open loops aggressively to retain through the full video
- Structure: Hook > Setup > Content > Payoff > CTA
- Pattern interrupts every 15-20 seconds via cuts, b-roll, graphics
- End screen CTAs work well for channel growth — always reference "the next video"`,
  };
  return platformGuides[platform] || platformGuides['instagram'];
}

// ─── Idea Generation ─────────────────────────────────────────────────

/**
 * Generate video ideas using Claude, informed by the SPCL framework.
 */
export async function generateIdeas(
  creatorContext: CreatorContext,
  userId: string,
  topic?: string,
  count: number = 5
): Promise<GeneratedIdea[]> {
  const learning = await getLearningContext(userId);
  const learningPrompt = buildLearningPrompt(learning);

  const prompt = `You are an elite short-form video strategist who has studied what makes videos go viral across TikTok, Instagram Reels, and YouTube Shorts. You specialize in the SPCL framework (Status, Power, Credibility, Likeness) and understand platform algorithms deeply.

Your job is to generate video ideas that will actually get VIEWS, FOLLOWERS, and LEADS for this creator:

${buildCreatorPrompt(creatorContext)}

${buildPlatformPrompt(creatorContext.primaryPlatform)}
${learningPrompt}

CONTENT STRATEGY: Of the ${count} ideas, aim for this strategic mix:
- ~40% REACH content (controversial takes, trend-riding, relatable moments — gets new eyeballs)
- ~30% AUTHORITY content (tutorials, frameworks, case studies — converts viewers to followers)
- ~30% CONVERSION content (testimonials, behind-the-scenes, soft offers — turns followers into leads/customers)
Label each idea with its contentType.

Generate ${count} video ideas. Each idea MUST:
1. Open with a SCROLL-STOPPING hook (first 1-3 seconds determine if the algorithm promotes your video)
2. Promise POWER — actionable value the viewer will gain
3. Weave in CREDIBILITY naturally (not bragging, but proof embedded in the content)
4. Include a LIKENESS element that makes the creator relatable
5. Target "interest media" — people actively interested in this topic, not random virality
6. Be filmable as a simple talking-head video (no fancy production needed)
7. Include 3 HOOK VARIATIONS using different psychological triggers (pattern interrupt, curiosity gap, bold claim, controversy, story open, data shock)
8. Identify the PRIMARY ENGAGEMENT PLAY — what action this video is designed to trigger from the viewer

${topic ? `Focus on this topic area: ${topic}` : "Generate diverse ideas across the creator's expertise."}

Return ONLY valid JSON array (no markdown, no code fences):
[
  {
    "title": "short punchy title (under 60 chars)",
    "hook": "the BEST opening line to say on camera (under 15 words)",
    "hookVariations": [
      "hook variation 1 — pattern interrupt style",
      "hook variation 2 — curiosity gap style",
      "hook variation 3 — bold claim or data shock style"
    ],
    "angle": "the unique perspective or contrarian take (1-2 sentences)",
    "contentType": "reach | authority | conversion",
    "engagementPlay": "saves | shares | comments | follows",
    "spclElements": {
      "status": "which status proof this leverages",
      "power": "what actionable value is delivered",
      "credibility": "what proof/validation is referenced",
      "likeness": "what relatable element is included"
    },
    "targetEmotion": "primary emotion (curiosity/FOMO/aspiration/anger/relief/surprise)",
    "estimatedLength": ${creatorContext.typicalVideoLength}
  }
]`;

  logger.debug(`[ScriptGenerator] Generating ${count} ideas for user ${userId}`);

  try {
    const completion = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 4096,
      temperature: 0.9,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = completion.choices[0]?.message?.content?.trim() || '';
    const jsonStr = raw.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
    const ideas: GeneratedIdea[] = JSON.parse(jsonStr);

    logger.debug(`[ScriptGenerator] Generated ${ideas.length} ideas`);
    return ideas;
  } catch (error) {
    logger.error('[ScriptGenerator] Failed to generate ideas', {
      error: error instanceof Error ? { message: error.message } : error,
      userId,
    });
    throw new Error('Failed to generate video ideas');
  }
}

// ─── Script Generation ───────────────────────────────────────────────

/**
 * Generate a teleprompter-ready script from a video idea.
 */
export async function generateScript(
  creatorContext: CreatorContext,
  userId: string,
  idea: { title: string; hook: string; angle: string; spclElements: Record<string, string>; estimatedLength: number },
  customInstructions?: string
): Promise<GeneratedScript> {
  const learning = await getLearningContext(userId);
  const learningPrompt = buildLearningPrompt(learning);

  const targetWords = Math.round((idea.estimatedLength / 60) * 150);

  const exampleScriptsSection =
    creatorContext.exampleScripts.length > 0
      ? `\n\nREFERENCE SCRIPTS (match this style and energy):\n${creatorContext.exampleScripts
          .slice(0, 3)
          .map((s, i) => `Example ${i + 1}: "${s.slice(0, 1000)}"`)
          .join('\n')}`
      : '';

  const prompt = `You are an elite short-form video scriptwriter who understands what makes videos get views, followers, and leads. You write teleprompter-ready scripts optimized for RETENTION (keeping viewers watching) and ENGAGEMENT (driving saves, shares, comments).

${buildCreatorPrompt(creatorContext)}

${buildPlatformPrompt(creatorContext.primaryPlatform)}
${exampleScriptsSection}
${learningPrompt}

VIDEO IDEA TO SCRIPT:
Title: ${idea.title}
Hook: ${idea.hook}
Angle: ${idea.angle}
SPCL Elements: ${JSON.stringify(idea.spclElements)}
Target Length: ${idea.estimatedLength} seconds (~${targetWords} words at 150 WPM)

${customInstructions ? `ADDITIONAL INSTRUCTIONS: ${customInstructions}` : ''}

Write a teleprompter-ready script following this EXACT structure:

HOOK (first 1-3 seconds, ~5-15 words):
- Must be the ABSOLUTE FIRST thing said on camera — no warmup, no intro
- Create a pattern interrupt or curiosity gap that stops the scroll
- The hook determines whether the algorithm promotes your video — make it count
- Include a [TEXT OVERLAY: "short punchy text"] for the on-screen text that appears during the hook
- Demonstrate status naturally (not bragging)

BODY (main content, 3-5 short sections):
- START each section with a MICRO-HOOK — a short phrase that re-engages attention:
  Examples: "Here's the thing though...", "But it gets better...", "Nobody tells you this part...", "And this is where it gets interesting..."
- Use OPEN LOOPS to keep viewers watching — hint at what's coming before delivering it:
  Example: "There are 3 reasons this works. The third one changed everything for me."
- Each section: 2-4 sentences max
- Provide actionable value (POWER element)
- Weave in credibility markers naturally — don't announce them, embed them
- Use conversational language matching creator's tone
- Add [PAUSE] where natural pauses should occur
- Add [TEXT OVERLAY: "key point"] for important takeaways viewers should see on screen
- Add [PATTERN INTERRUPT] every ~15-20 seconds to signal where the creator should shift energy, change angle, or cut

CTA (closing 5-10 seconds):
- DO NOT use generic "follow for more" or "like and subscribe" — these are invisible to viewers now
- Instead, use ONE of these high-engagement CTA styles based on the content:
  * SAVE: "Save this for when you need it" / "Screenshot this list"
  * SHARE: "Send this to someone who [specific situation relevant to the content]"
  * COMMENT: "Drop [specific word] in the comments if [specific relatable situation]"
  * FOLLOW: "I'm breaking down [specific topic] in part 2 — follow so you don't miss it"
  * CONVERT: "I put the full [resource] in my bio" (only for conversion content)
- Include likeness element (be real/authentic)
- End with a STRONG final line — never trail off

PRODUCTION NOTES — include these markers throughout:
- [TEXT OVERLAY: "exact text"] — On-screen text (MUST include at least one in the hook and 1-2 in the body)
- [B-ROLL: description] — Suggested visual cutaway (optional, where relevant)
- [ENERGY SHIFT: description] — Where to change vocal energy or intensity
- [PATTERN INTERRUPT] — Where to cut/zoom/change angle to maintain retention

RULES:
- Write EXACTLY how someone talks, not how they write
- Use short sentences. Fragments are fine. Punchy is better.
- No filler phrases ("so basically", "you know what I mean", "let me tell you")
- No emojis or formatting symbols in the spoken script text
- Mark [PAUSE] where natural pauses should occur
- Target ~${targetWords} words total (~${idea.estimatedLength} seconds of speaking)

Return ONLY valid JSON (no markdown, no code fences):
{
  "title": "${idea.title}",
  "hook": "exact hook text to read on teleprompter (including [TEXT OVERLAY] marker)",
  "body": "full body text with [PAUSE], [TEXT OVERLAY], [PATTERN INTERRUPT], and micro-hooks",
  "cta": "closing call to action text",
  "fullScript": "complete script: hook + body + cta combined as one continuous read with all markers",
  "estimatedDuration": ${idea.estimatedLength},
  "wordCount": ${targetWords},
  "spclBreakdown": {
    "status": "how status is demonstrated in this script",
    "power": "what actionable value is delivered",
    "credibility": "where credibility appears",
    "likeness": "where authenticity shows through"
  }
}`;

  logger.debug(`[ScriptGenerator] Generating script for idea: "${idea.title}" (user ${userId})`);

  try {
    const completion = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 4096,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = completion.choices[0]?.message?.content?.trim() || '';
    const jsonStr = raw.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
    const script: GeneratedScript = JSON.parse(jsonStr);

    // Recalculate word count from actual output (strip all production markers)
    const spokenText = script.fullScript
      .replace(/\[PAUSE\]/g, '')
      .replace(/\[TEXT OVERLAY:[^\]]*\]/g, '')
      .replace(/\[B-ROLL:[^\]]*\]/g, '')
      .replace(/\[ENERGY SHIFT:[^\]]*\]/g, '')
      .replace(/\[PATTERN INTERRUPT\]/g, '');
    script.wordCount = spokenText.split(/\s+/).filter(Boolean).length;
    script.estimatedDuration = Math.round((script.wordCount / 150) * 60);

    logger.debug(`[ScriptGenerator] Generated script: ${script.wordCount} words, ~${script.estimatedDuration}s`);
    return script;
  } catch (error) {
    logger.error('[ScriptGenerator] Failed to generate script', {
      error: error instanceof Error ? { message: error.message } : error,
      userId,
    });
    throw new Error('Failed to generate script');
  }
}
