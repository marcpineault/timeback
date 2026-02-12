/**
 * AI Script Generator for Video Content
 *
 * Uses Claude to generate video ideas and teleprompter-ready scripts
 * based on the creator's SPCL profile (Status, Power, Credibility, Likeness).
 * Learns from user ratings and edit patterns over time.
 */

import Anthropic from '@anthropic-ai/sdk';
import { prisma } from './db';
import { logger } from './logger';

const anthropic = new Anthropic();

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
  angle: string;
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

  const prompt = `You are a viral short-form video strategist who specializes in the SPCL framework (Status, Power, Credibility, Likeness).

Your job is to generate scroll-stopping video ideas for a creator with this profile:

${buildCreatorPrompt(creatorContext)}
${learningPrompt}

Generate ${count} video ideas. Each idea MUST:
1. Open with a hook that demonstrates STATUS or creates CURIOSITY (first 3 seconds)
2. Promise POWER - actionable value the viewer will gain
3. Weave in CREDIBILITY naturally (not bragging, but proof)
4. Include a LIKENESS element that makes the creator relatable
5. Target "interest media" - people searching for this topic, not random virality
6. Be filmable as a simple talking-head video (no fancy production needed)

${topic ? `Focus on this topic area: ${topic}` : "Generate diverse ideas across the creator's expertise."}

Return ONLY valid JSON array (no markdown, no code fences):
[
  {
    "title": "short punchy title (under 60 chars)",
    "hook": "exact opening line to say on camera (under 15 words)",
    "angle": "the unique perspective or contrarian take (1-2 sentences)",
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
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      temperature: 0.9,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    const jsonStr = content.text.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
    const ideas: GeneratedIdea[] = JSON.parse(jsonStr);

    logger.debug(`[ScriptGenerator] Generated ${ideas.length} ideas`);
    return ideas;
  } catch (error) {
    logger.error('[ScriptGenerator] Failed to generate ideas', { error, userId });
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

  const prompt = `You are a short-form video scriptwriter. You write teleprompter-ready scripts optimized for talking-head videos that get views in the creator's niche.

${buildCreatorPrompt(creatorContext)}
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

HOOK (first 3-5 seconds, ~10-20 words):
- Must be the FIRST thing said on camera
- Create pattern interrupt or curiosity gap
- Demonstrate status naturally (not bragging)

BODY (main content, 3-5 short sections):
- Each section: 2-4 sentences max
- Provide actionable value (POWER element)
- Weave in credibility markers naturally
- Use conversational language matching creator's tone
- Include transition phrases between sections
- Add [PAUSE] where natural pauses should occur

CTA (closing 5-10 seconds):
- Clear, specific call to action
- Include likeness element (be real/authentic)
- End strong - don't trail off

RULES:
- Write EXACTLY how someone talks, not how they write
- Use short sentences. Fragments are fine.
- No filler phrases ("so basically", "you know what I mean")
- No emojis or formatting symbols in the script text
- Mark [PAUSE] where natural pauses should occur
- Target ~${targetWords} words total (~${idea.estimatedLength} seconds of speaking)

Return ONLY valid JSON (no markdown, no code fences):
{
  "title": "${idea.title}",
  "hook": "exact hook text to read on teleprompter",
  "body": "full body text with [PAUSE] markers and natural flow",
  "cta": "closing call to action text",
  "fullScript": "complete script: hook + body + cta combined as one continuous read",
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
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    const jsonStr = content.text.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
    const script: GeneratedScript = JSON.parse(jsonStr);

    // Recalculate word count from actual output
    script.wordCount = script.fullScript.replace(/\[PAUSE\]/g, '').split(/\s+/).filter(Boolean).length;
    script.estimatedDuration = Math.round((script.wordCount / 150) * 60);

    logger.debug(`[ScriptGenerator] Generated script: ${script.wordCount} words, ~${script.estimatedDuration}s`);
    return script;
  } catch (error) {
    logger.error('[ScriptGenerator] Failed to generate script', { error, userId });
    throw new Error('Failed to generate script');
  }
}
