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

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    throw new Error('CLAUDE_API_KEY environment variable is not set');
  }
  return new Anthropic({ apiKey });
}

// ─── Types ───────────────────────────────────────────────────────────

export interface CreatorContext {
  niche: string;
  targetAudience: string;
  contentGoal: string;
  originStory: string;
  struggle: string;
  mission: string;
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
  // Vertical context (optional — only populated when user has a vertical profile)
  vertical?: string;
  market?: string;
  specialization?: string;
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

// ─── Content Styles (Expert-Informed Formats) ────────────────────────

export const CONTENT_STYLES = {
  'auto': {
    label: 'Any Style',
    description: 'AI picks the best format for each idea',
    promptInstructions: '',
  },
  'hook-story-lesson': {
    label: 'Story + Lesson',
    description: 'Tell a short story, end with a takeaway',
    promptInstructions: `CONTENT FORMAT: Story + Lesson
Each idea MUST follow this structure:
- HOOK: A pattern-interrupting opening that creates immediate curiosity about a specific outcome or event
- STORY: A brief narrative (personal experience, client story, or observed situation) that illustrates the point. Keep it vivid but under 30 seconds.
- TAKEAWAY: A single, clear, actionable lesson the viewer walks away with
The story is the vehicle — the takeaway is the payload. The hook promises something the story delivers.
Think: "What happened?" → "Here's what I learned" → "Here's what you should do."`,
  },
  'contrarian-take': {
    label: 'Contrarian Take',
    description: 'Challenge common wisdom with a surprising perspective',
    promptInstructions: `CONTENT FORMAT: Contrarian Take
Each idea MUST follow this structure:
- HOOK: State the commonly-held belief, then immediately challenge it ("Everyone says X. They're wrong.")
- BODY: Present evidence/experience that proves the contrarian position. Use specific numbers, timelines, or results.
- CLOSE: Reframe the viewer's understanding — give them a new mental model
The power comes from cognitive dissonance — the viewer's existing belief collides with your evidence. This drives comments (agreement/disagreement) and shares ("you need to see this").`,
  },
  'step-by-step': {
    label: 'How-To / Steps',
    description: 'Teach something in clear numbered steps',
    promptInstructions: `CONTENT FORMAT: Numbered Steps / How-To
Each idea MUST follow this structure:
- HOOK: Promise a specific outcome with a specific number of steps ("3 steps to X" or "Do this to get Y")
- BODY: Deliver exactly the promised number of steps. Each step: (1) Named clearly, (2) Explained in 1-2 sentences, (3) Given a specific example or micro-action
- CLOSE: Summarize what they now have ("You now have a complete system for X") + CTA to save
This format maximizes SAVES because it delivers screenshot-worthy, reference-back value. Each step should deliver standalone value.`,
  },
  'before-after': {
    label: 'Before & After',
    description: 'Show transformation — what changed and how',
    promptInstructions: `CONTENT FORMAT: Before → After → Bridge
Each idea MUST follow this structure:
- HOOK: Paint the "before" state vividly — the pain, frustration, or struggle the audience recognizes
- BODY: Show the "after" state — specific results, feelings, or outcomes. Then reveal the BRIDGE — the specific thing that changed.
- CLOSE: Give the viewer the first step to cross that same bridge
This format works because viewers self-identify with the "before" state and are pulled through by wanting the "after." The bridge is where CREDIBILITY and POWER shine.`,
  },
  'myth-buster': {
    label: 'Myth Buster',
    description: 'Debunk a common mistake your audience makes',
    promptInstructions: `CONTENT FORMAT: Myth Buster
Each idea MUST follow this structure:
- HOOK: State the myth as if it were true, then shatter it ("You've been told X. Here's why that's costing you Y.")
- BODY: Explain WHY the myth exists (shows depth), then present what actually works with proof
- CLOSE: Give the corrected approach in one clear sentence + CTA
This triggers the "I need to know what I'm doing wrong" response. It positions the creator as someone who sees what others miss — driving FOLLOWS and SHARES.`,
  },
  // ── Mortgage-specific styles ──
  'rate-reaction': {
    label: 'Rate Reaction',
    description: 'React to a rate change, BoC announcement, or market shift',
    promptInstructions: `CONTENT FORMAT: Rate Reaction / Market Update
Each idea MUST follow this structure:
- HOOK: Lead with the news or data point — make it feel URGENT and time-sensitive ("The Bank of Canada just did X. Here's what it means for you.")
- BODY: Break down what happened in plain language (no jargon), then explain the REAL impact on buyers/homeowners/renewals. Use a specific scenario ("If you have a $500K mortgage, this means..."). Add your professional take — what should people actually DO about this?
- CLOSE: Give one clear action step + CTA to reach out or save for later
This format works because rate changes create URGENCY and FEAR — viewers are actively searching for answers. Position yourself as the calm, knowledgeable voice in a sea of panic. Drives SHARES ("everyone needs to see this") and COMMENTS (people sharing their own situations).`,
  },
  'client-education': {
    label: 'Client Education',
    description: 'Teach a mortgage concept in plain, jargon-free language',
    promptInstructions: `CONTENT FORMAT: Client Education / Jargon Buster
Each idea MUST follow this structure:
- HOOK: Start with the confusing term or concept, then promise clarity ("Everyone talks about the stress test but nobody explains it like this.")
- BODY: Explain the concept as if talking to a friend over coffee. Use a real-world example with actual numbers ("On a $600K home with 10% down, here's exactly what happens..."). Break it into 2-3 bite-sized pieces. Each piece should have an "aha moment."
- CLOSE: Summarize in one sentence + "Save this for when you need it"
Mortgage jargon scares people away from asking questions. This format makes you the approachable expert who explains things simply. Maximizes SAVES (people bookmark for future reference) and FOLLOWS (they want more plain-language explanations).`,
  },
  'personal-story': {
    label: 'Personal Story',
    description: 'Share a real client story or personal experience from the industry',
    promptInstructions: `CONTENT FORMAT: Personal / Client Story
Each idea MUST follow this structure:
- HOOK: Open with the dramatic moment or surprising outcome ("My client was about to lose their dream home. Then I made one phone call.")
- BODY: Tell the story with specific (anonymized) details — what was the situation, what was the obstacle, what did you do differently? Show your expertise through ACTION, not by stating credentials. Include the emotional journey — the stress, the relief, the celebration.
- CLOSE: Extract the universal lesson ("If you're in a similar situation, here's what you need to know") + soft CTA
Personal stories are the HIGHEST engagement format because they're impossible to replicate. They build TRUST faster than any educational content. Drives COMMENTS (people sharing similar experiences) and FOLLOWS (they want to see more stories).`,
  },
  // ── Real Estate Agent-specific styles ──
  'market-update': {
    label: 'Market Update',
    description: 'Share local market data, trends, or a monthly market snapshot',
    promptInstructions: `CONTENT FORMAT: Market Update / Data-Driven
Each idea MUST follow this structure:
- HOOK: Lead with a specific, surprising data point about the local market ("Homes in [neighborhood] are selling $30K over asking. Here's why.")
- BODY: Break down 2-3 key metrics (average price, days on market, inventory levels) in plain language. Compare to last month or last year. Explain what it means for buyers AND sellers. Use a specific scenario to make the data tangible.
- CLOSE: Give one clear action step based on the data + CTA to reach out
This format positions you as THE local market expert. People follow market-update creators because they deliver consistent, reliable data. Drives SAVES (reference material) and FOLLOWS (they want monthly updates).`,
  },
  'listing-showcase': {
    label: 'Listing Showcase',
    description: 'Walk through a listing, open house recap, or property tour',
    promptInstructions: `CONTENT FORMAT: Listing Showcase / Property Tour
Each idea MUST follow this structure:
- HOOK: Lead with the most surprising or aspirational element ("This $400K home has a feature most million-dollar homes don't have")
- BODY: Walk through the property highlighting 3-4 standout features. For each feature, explain the BENEFIT, not just the feature (not "granite countertops" but "a kitchen you'll actually want to cook in"). Address potential objections preemptively. Paint a lifestyle picture — help viewers imagine living there.
- CLOSE: Include neighborhood context (what's nearby) + CTA to book a showing or DM for details
Property tours get MASSIVE engagement because everyone loves looking at homes. The key is to tell a STORY, not just list features. Drives SHARES ("look at this house!") and COMMENTS (opinions on the property).`,
  },
  'neighborhood-guide': {
    label: 'Neighborhood Guide',
    description: 'Spotlight a local neighborhood, community, or area',
    promptInstructions: `CONTENT FORMAT: Neighborhood Guide / Local Expert
Each idea MUST follow this structure:
- HOOK: Open with a bold claim or surprising fact about the neighborhood ("This is the most underrated neighborhood in [city] and here's proof")
- BODY: Cover the highlights — walkability, restaurants, schools, parks, community vibe, price range, transit access. Be HONEST — mention downsides too (this builds credibility). Include a "best for" statement (families, young professionals, retirees, etc.). Reference specific places by name.
- CLOSE: Invite viewers to suggest neighborhoods for future guides + CTA
Neighborhood guides are the ULTIMATE local content. They rank in search, get shared by locals, and demonstrate deep market knowledge. Drives COMMENTS ("do my neighborhood next!") and SAVES (people reference them when house hunting).`,
  },
  // ── Financial Advisor-specific styles ──
  'market-commentary': {
    label: 'Market Commentary',
    description: 'React to market news, economic data, or financial events',
    promptInstructions: `CONTENT FORMAT: Market Commentary / Financial News Reaction
Each idea MUST follow this structure:
- HOOK: Lead with the news or data point — make it feel relevant to everyday people ("The Fed just made a decision that affects every single person with a savings account")
- BODY: Break down what happened in plain language (no jargon). Explain the REAL impact on regular people — not Wall Street. Use a specific scenario ("If you have $50K in a savings account, this means..."). Add your professional perspective — what should people actually DO about this?
- CLOSE: Give one clear, non-advisory action step ("Review your allocation" not "buy X stock") + CTA
This format works because financial news creates ANXIETY and people are actively searching for a calm, knowledgeable voice. Position yourself as the advisor who cuts through the noise. Drives SHARES and FOLLOWS.`,
  },
  'financial-education': {
    label: 'Client Education',
    description: 'Explain a financial concept in simple, jargon-free language',
    promptInstructions: `CONTENT FORMAT: Financial Education / Jargon Buster
Each idea MUST follow this structure:
- HOOK: Start with the confusing concept, then promise clarity ("Everyone talks about compound interest but nobody explains it like this")
- BODY: Explain the concept as if talking to a smart friend over coffee. Use a real-world example with actual numbers ("If you start investing $200/month at 25, here's exactly what happens by 65..."). Break it into 2-3 bite-sized pieces. Each piece should have an "aha moment."
- CLOSE: Summarize in one sentence + "Save this for when you need it"
Financial jargon intimidates people and stops them from taking action. This format makes you the approachable expert. Maximizes SAVES (people bookmark for reference) and FOLLOWS (they want more simple explanations). CRITICAL: Frame as educational, never as specific advice.`,
  },
  'trust-building': {
    label: 'Trust Building',
    description: 'Build credibility through transparency, client stories, or industry insights',
    promptInstructions: `CONTENT FORMAT: Trust Building / Transparency Content
Each idea MUST follow this structure:
- HOOK: Open with radical transparency or a surprising admission ("I'm a financial advisor and here's what I think about the fees in my own industry")
- BODY: Be genuinely transparent about something in the financial industry — how advisors get paid, what to watch out for, what questions to ask. Share anonymized client success stories with specific (but private) results. Show your process — what happens in a first meeting, how you build a plan, etc.
- CLOSE: Invite questions or offer a free consultation for people who want to learn more
Trust content is the HIGHEST converting format for financial advisors because it addresses the #1 barrier: "Can I trust this person with my money?" Drives FOLLOWS (they want someone transparent) and COMMENTS (people sharing their own experiences or asking questions).`,
  },
} as const;

export type ContentStyle = keyof typeof CONTENT_STYLES;

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

  // Origin story — personal narrative for authentic content
  const hasOriginStory = ctx.originStory || ctx.struggle || ctx.mission;
  if (hasOriginStory) {
    const storyParts = [`\nORIGIN STORY (weave these personal elements into content naturally — they make the creator relatable and authentic):`];
    if (ctx.originStory) storyParts.push(`- Why they got into this: ${ctx.originStory}`);
    if (ctx.struggle) storyParts.push(`- Defining challenge/struggle: ${ctx.struggle}`);
    if (ctx.mission) storyParts.push(`- Personal mission: ${ctx.mission}`);
    parts.push(storyParts.join('\n'));
  }

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

  // ── Vertical-specific context injection ──
  if (ctx.vertical) {
    parts.push(buildVerticalPrompt(ctx.vertical, ctx.market, ctx.specialization));
  }

  return parts.join('\n');
}

/**
 * Build vertical-specific prompt context based on the creator's industry.
 */
function buildVerticalPrompt(vertical: string, market?: string, specialization?: string): string {
  if (vertical === 'MORTGAGE_BROKER') {
    return buildMortgageBrokerPrompt(market, specialization);
  }
  if (vertical === 'REAL_ESTATE_AGENT') {
    return buildRealEstateAgentPrompt(market, specialization);
  }
  if (vertical === 'FINANCIAL_ADVISOR') {
    return buildFinancialAdvisorPrompt(market, specialization);
  }

  return '';
}

function buildMortgageBrokerPrompt(market?: string, specialization?: string): string {
  const parts: string[] = [
    `\nINDUSTRY CONTEXT — MORTGAGE BROKER:`,
    `This creator is a licensed mortgage broker/agent. All content must reflect this professional context:`,
  ];

  // Market-specific context
  if (market) {
    parts.push(`\nMARKET: ${market}`);
    parts.push(`- Reference the local market naturally (e.g. "here in ${market}")`);
    parts.push(`- Use local housing market conditions and price ranges relevant to ${market}`);

    // Canadian market detection
    const canadianMarkers = [
      'Toronto', 'Vancouver', 'Calgary', 'Edmonton', 'Ottawa', 'Montreal',
      'Winnipeg', 'Halifax', 'Victoria', 'Kitchener', 'Hamilton', 'London',
      'GTA', 'Greater Toronto', 'Lower Mainland', 'Ontario', 'BC', 'British Columbia',
      'Alberta', 'Quebec', 'Manitoba', 'Saskatchewan', 'Nova Scotia', 'Canada',
    ];
    const isCanadian = canadianMarkers.some(m => market.toLowerCase().includes(m.toLowerCase()));

    if (isCanadian) {
      parts.push(`\nCANADIAN MORTGAGE CONTEXT (MUST reference these where relevant):`);
      parts.push(`- Bank of Canada (BoC) rate decisions and their impact on variable-rate mortgages`);
      parts.push(`- CMHC mortgage insurance (required for down payments under 20%)`);
      parts.push(`- The mortgage stress test (qualifying rate is typically contract rate + 2%, or 5.25%, whichever is higher)`);
      parts.push(`- Fixed vs variable rate considerations in the Canadian context`);
      parts.push(`- 5-year mortgage terms (standard in Canada) and renewal strategies`);
      parts.push(`- Canadian first-time home buyer incentives (FHSA, HBP/RRSP withdrawal)`);
      parts.push(`- Pre-approval vs pre-qualification process`);
      parts.push(`- Mortgage portability and blend-and-extend options`);
      parts.push(`- Penalties for breaking a mortgage early (IRD vs 3 months' interest)`);
      parts.push(`- NEVER reference US-specific terms like "30-year fixed", "FHA loans", "Fannie Mae/Freddie Mac", or "closing costs" in a US sense`);
    }
  }

  // Specialization context
  if (specialization) {
    parts.push(`\nSPECIALIZATION: ${specialization}`);
    parts.push(`- Lean into this specialty when generating ideas — it's what differentiates this creator`);
  }

  parts.push(`\nMORTGAGE CONTENT GUIDELINES:`);
  parts.push(`- Explain concepts in plain language — viewers are often confused, not stupid`);
  parts.push(`- Use real-number scenarios (e.g. "On a $600K home with 10% down...")`);
  parts.push(`- Address common fears: rejection, affordability, rate changes, hidden fees`);
  parts.push(`- Position the creator as the trusted advisor who simplifies the complex`);
  parts.push(`- Content should educate AND build trust — every video should make the viewer think "I want this person handling my mortgage"`);
  parts.push(`- Timely content around rate announcements and market shifts performs extremely well`);
  parts.push(`- NEVER give specific financial advice — frame as educational ("here's how it generally works" not "you should do X")`);

  return parts.join('\n');
}

function buildRealEstateAgentPrompt(market?: string, specialization?: string): string {
  const parts: string[] = [
    `\nINDUSTRY CONTEXT — REAL ESTATE AGENT:`,
    `This creator is a licensed real estate agent. All content must reflect this professional context:`,
  ];

  if (market) {
    parts.push(`\nMARKET: ${market}`);
    parts.push(`- Reference the local market naturally (e.g. "here in ${market}")`);
    parts.push(`- Use local housing market conditions, price ranges, and neighborhoods relevant to ${market}`);
    parts.push(`- Reference local landmarks, school districts, and community features when relevant`);

    // Canadian market detection
    const canadianMarkers = [
      'Toronto', 'Vancouver', 'Calgary', 'Edmonton', 'Ottawa', 'Montreal',
      'Winnipeg', 'Halifax', 'Victoria', 'Kitchener', 'Hamilton', 'London',
      'GTA', 'Greater Toronto', 'Lower Mainland', 'Ontario', 'BC', 'British Columbia',
      'Alberta', 'Quebec', 'Manitoba', 'Saskatchewan', 'Nova Scotia', 'Canada',
    ];
    const isCanadian = canadianMarkers.some(m => market.toLowerCase().includes(m.toLowerCase()));

    if (isCanadian) {
      parts.push(`\nCANADIAN REAL ESTATE CONTEXT (MUST reference these where relevant):`);
      parts.push(`- Use Canadian terminology: "realtor", "listing agent", "buyer's agent"`);
      parts.push(`- Reference Canadian processes: conditional offers, home inspections, lawyer-based closings`);
      parts.push(`- Canadian-specific costs: land transfer tax, CMHC insurance for buyers, GST/HST on new builds`);
      parts.push(`- Reference the Canadian Real Estate Association (CREA) and local board data`);
      parts.push(`- NEVER reference US-specific terms like "closing costs" in a US sense, "HOA" (use "condo fees"), "realtor commissions" post-NAR settlement`);
    } else {
      parts.push(`\nUS REAL ESTATE CONTEXT:`);
      parts.push(`- Reference MLS data and local market statistics`);
      parts.push(`- US-specific processes: escrow, title insurance, HOA`);
      parts.push(`- Be aware of NAR settlement changes and buyer agent compensation`);
    }
  }

  if (specialization) {
    parts.push(`\nSPECIALIZATION: ${specialization}`);
    parts.push(`- Lean into this specialty when generating ideas — it's what differentiates this creator`);
  }

  parts.push(`\nREAL ESTATE CONTENT GUIDELINES:`);
  parts.push(`- Be the local market expert — reference specific neighborhoods, price points, and trends`);
  parts.push(`- Use real numbers and scenarios (e.g. "A 3-bed in [neighborhood] is going for $X right now")`);
  parts.push(`- Address common fears: bidding wars, overpaying, hidden problems, market timing`);
  parts.push(`- Position the creator as the trusted local expert who knows the market inside and out`);
  parts.push(`- Content should educate AND build trust — every video should make the viewer think "I want this agent representing me"`);
  parts.push(`- Neighborhood tours, market updates, and buyer/seller tips perform extremely well`);
  parts.push(`- Show personality — real estate is a relationship business and people hire agents they like`);
  parts.push(`- NEVER make guarantees about returns or market predictions — frame as analysis and informed opinions`);

  return parts.join('\n');
}

function buildFinancialAdvisorPrompt(market?: string, specialization?: string): string {
  const parts: string[] = [
    `\nINDUSTRY CONTEXT — FINANCIAL ADVISOR:`,
    `This creator is a financial advisor/planner. All content must reflect this professional context:`,
  ];

  if (market) {
    parts.push(`\nMARKET: ${market}`);
    parts.push(`- Reference the local market naturally when relevant (e.g. "here in ${market}")`);
    parts.push(`- Reference local cost of living, state/provincial tax implications, and economic conditions`);

    // Canadian market detection
    const canadianMarkers = [
      'Toronto', 'Vancouver', 'Calgary', 'Edmonton', 'Ottawa', 'Montreal',
      'Winnipeg', 'Halifax', 'Victoria', 'Kitchener', 'Hamilton', 'London',
      'GTA', 'Greater Toronto', 'Lower Mainland', 'Ontario', 'BC', 'British Columbia',
      'Alberta', 'Quebec', 'Manitoba', 'Saskatchewan', 'Nova Scotia', 'Canada',
    ];
    const isCanadian = canadianMarkers.some(m => market.toLowerCase().includes(m.toLowerCase()));

    if (isCanadian) {
      parts.push(`\nCANADIAN FINANCIAL CONTEXT (MUST reference these where relevant):`);
      parts.push(`- TFSA (Tax-Free Savings Account) — annual contribution limits and lifetime room`);
      parts.push(`- RRSP (Registered Retirement Savings Plan) — contribution limits, RRSP vs TFSA debate`);
      parts.push(`- FHSA (First Home Savings Account) — newer account for first-time buyers`);
      parts.push(`- CPP (Canada Pension Plan) and OAS (Old Age Security) — when to start collecting`);
      parts.push(`- RESP (Registered Education Savings Plan) — for education savings`);
      parts.push(`- Canadian capital gains and dividend tax treatment`);
      parts.push(`- NEVER reference US-specific terms like "401(k)", "IRA", "Social Security", "529 plan" unless comparing to Canadian equivalents`);
    } else {
      parts.push(`\nUS FINANCIAL CONTEXT:`);
      parts.push(`- 401(k) and IRA (Traditional & Roth) contribution limits and strategies`);
      parts.push(`- Social Security optimization — when to start collecting`);
      parts.push(`- 529 plans for education savings`);
      parts.push(`- HSA (Health Savings Account) as a triple-tax-advantaged account`);
      parts.push(`- US capital gains tax brackets and tax-loss harvesting strategies`);
      parts.push(`- State-specific tax considerations when relevant`);
    }
  }

  if (specialization) {
    parts.push(`\nSPECIALIZATION: ${specialization}`);
    parts.push(`- Lean into this specialty when generating ideas — it's what differentiates this creator`);
  }

  parts.push(`\nFINANCIAL ADVISOR CONTENT GUIDELINES:`);
  parts.push(`- Simplify complex financial concepts — viewers are overwhelmed, not unintelligent`);
  parts.push(`- Use real-number scenarios (e.g. "If you're 35 and saving $500/month, here's what you'll have at 65...")`);
  parts.push(`- Address common fears: running out of money in retirement, market crashes, not saving enough, taxes`);
  parts.push(`- Position the creator as the calm, knowledgeable advisor who makes money less scary`);
  parts.push(`- Content should educate AND build trust — every video should make the viewer think "I need to talk to this person"`);
  parts.push(`- Myth-busting and jargon-breaking content performs extremely well`);
  parts.push(`- Emphasize the FIDUCIARY standard and fee transparency — differentiate from salespeople`);
  parts.push(`- COMPLIANCE IS CRITICAL: NEVER give specific investment recommendations, guarantee returns, or provide personalized financial advice`);
  parts.push(`- Always frame as educational content: "here's how it generally works" not "you should buy X"`);
  parts.push(`- Include appropriate disclaimers in tone: "talk to your advisor" or "this is educational, not advice"`);

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
- Saves and shares weight heavily — make content screenshot-worthy or send-worthy
- Use open loops in the first 2 seconds — tease an outcome the viewer must stay to see`,

    'instagram': `PLATFORM: Instagram Reels
- Saves are the #1 algorithm signal. Create save-worthy educational content.
- Share triggers work extremely well ("Send this to someone who...")
- Slightly more polished than TikTok — aesthetic matters but authenticity wins
- Hook can be 10-12 words but must stop the scroll in the first 1-2 seconds
- Optimal length: 30-90 seconds
- Carousel-adjacent value (content worth saving for later) outperforms entertainment-only
- Open loops drive completion rate — tease a payoff early that you deliver at the end`,

    'youtube-shorts': `PLATFORM: YouTube Shorts
- Searchability matters more than other platforms — title should match search intent
- Curiosity gaps perform better than controversy on YouTube
- Watch time is weighted HEAVILY — build in retention hooks throughout
- Longer content (60-90s) works well because YouTube favors total watch time
- Subscribers matter more — use strategic follow CTAs
- Pattern interrupts every 8-10 seconds minimum to maintain retention
- Open loops are critical for watch time — promise a reveal or payoff the viewer can't leave without seeing`,

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
  count: number = 5,
  contentStyle: ContentStyle = 'auto'
): Promise<GeneratedIdea[]> {
  const learning = await getLearningContext(userId);
  const learningPrompt = buildLearningPrompt(learning);

  const styleInstructions = CONTENT_STYLES[contentStyle]?.promptInstructions || '';

  const prompt = `You are an elite short-form video strategist who has generated billions of views studying what makes videos go viral across TikTok, Instagram Reels, and YouTube Shorts. You specialize in the SPCL framework (Status, Power, Credibility, Likeness) and understand platform algorithms deeply.

CORE PRINCIPLES:
- VALUE EQUATION: Every idea must maximize (Dream Outcome x Perceived Likelihood of Achievement) while minimizing (Time Delay x Effort) for the viewer. High-value content promises a desirable outcome that feels achievable quickly and easily.
- NEWS-STYLE HOOKS: Every hook should read like a headline — it must contain at least one trigger: recency ("just discovered"), relevancy ("if you're a [audience]"), conflict ("why X is wrong"), or unusualness ("the weird trick").
- EFFECT ON VIEWER: For each idea, consider not just WHAT the content does, but WHY it works psychologically. What emotion does it trigger? What action does it compel?
- ONE CLEAR FOCUS: Each video = ONE clear problem, ONE clear insight, ONE clear next step. Never try to cover multiple topics in a single video.
- GIVE VALUE FREELY: For every 3 value-giving videos, only 1 should ask for something. Weight toward generosity — the audience should feel they got more than expected.
- OPEN LOOPS: The most powerful retention tool. An open loop is an unresolved question, tease, or promise that the viewer's brain NEEDS to close. Open a loop in the hook ("I'll show you the one thing that changed everything"), keep it open through the body, and close it near the end. The viewer literally cannot swipe away until the loop is closed. Layer multiple loops for maximum retention.

Your job is to generate video ideas that will actually get VIEWS, FOLLOWERS, and LEADS for this creator:

${buildCreatorPrompt(creatorContext)}

${buildPlatformPrompt(creatorContext.primaryPlatform)}
${learningPrompt}

CONTENT STRATEGY: Of the ${count} ideas, aim for this strategic mix:
- ~40% REACH content (controversial takes, trend-riding, relatable moments — gets new eyeballs)
- ~30% AUTHORITY content (tutorials, frameworks, case studies — converts viewers to followers)
- ~30% CONVERSION content (testimonials, behind-the-scenes, soft offers — turns followers into leads/customers)
Label each idea with its contentType.
${styleInstructions ? `\n${styleInstructions}\n` : ''}
Generate ${count} video ideas. Each idea MUST:
1. Open with a SCROLL-STOPPING hook (first 1-3 seconds determine if the algorithm promotes your video)
2. Promise POWER — actionable value the viewer will gain
3. Weave in CREDIBILITY naturally (not bragging, but proof embedded in the content)
4. Include a LIKENESS element that makes the creator relatable
5. Target "interest media" — people actively interested in this topic, not random virality
6. Be filmable as a simple talking-head video (no fancy production needed)
7. Include 3 HOOK VARIATIONS, each using a DIFFERENT proven trigger:
   - NEWS-STYLE: reads like a headline (recency, conflict, relevancy, or unusualness)
   - CURIOSITY GAP: creates an open loop the viewer MUST close ("The one thing about X that nobody mentions...")
   - BOLD CLAIM / DATA SHOCK: leads with a specific, surprising number or result
8. Identify the PRIMARY ENGAGEMENT PLAY — what action this video is designed to trigger from the viewer
9. Build in at least ONE open loop — an unresolved question or tease embedded in the hook or angle that keeps the viewer watching to the end. The idea should make the viewer think "I HAVE to see how this ends."

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
    const message = await getAnthropicClient().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      temperature: 0.9,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
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

Every script you write must pass the VALUE EQUATION test: Does the viewer's perceived Dream Outcome and Likelihood of Success outweigh the Time and Effort they invest watching? If the viewer doesn't feel "I can do this and it will work" by the end, the script fails.

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
- The hook should read like a news headline — lead with recency, conflict, relevancy, or unusualness
- The hook determines whether the algorithm promotes your video — make it count
- RETAIN: Within the first 10 seconds, give the viewer a reason to stay for the ENTIRE video (preview the payoff)
- OPEN A LOOP: The hook should create an unresolved question the viewer MUST stay to answer. Tease an outcome, a number, a method, or a story — but don't reveal it yet.
- Include a [TEXT OVERLAY: "short punchy text"] for the on-screen text that appears during the hook
- Demonstrate status naturally (not bragging)

BODY (main content, 3-5 short sections):
- START each section with a MICRO-HOOK — a short phrase that re-engages attention:
  Examples: "Here's the thing though...", "But it gets better...", "Nobody tells you this part...", "And this is where it gets interesting..."
- OPEN LOOPS are your #1 retention weapon. An open loop is an unresolved question or tease that the viewer's brain NEEDS to close — they literally cannot swipe away until it's resolved. Layer them throughout:
  * MACRO LOOP: Open in the hook, close near the end ("I'll show you the exact method..." — don't reveal it until the final section)
  * MICRO LOOPS: Open and close within each section to pull viewers through ("There are 3 reasons this works. The third one is the one nobody talks about." — then deliver #1 and #2 before revealing #3)
  * STACKING: When closing one loop, open the next ("Now that you know X, here's why that alone won't work...")
  Example: "I lost 10 clients in one week. [OPEN] But it turned out to be the best thing that happened to my business. [TEASE] Here's why — and the exact system I built because of it. [PROMISE]"
- REWARD the viewer at regular intervals — don't save all the value for the end. Each section should deliver a standalone insight.
- Give value generously. The body should feel like the viewer is getting more than expected, not like a sales pitch.
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
  * CLIFFHANGER: Open a NEW loop for the next video ("But there's a second part to this that's even more important — I'll break it down in part 2")
- IMPORTANT: The CTA should feel EARNED, not forced. The viewer should feel they received so much value that the CTA is a natural next step, not an interruption. Match CTA intensity to how much value was delivered.
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
    const message = await getAnthropicClient().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
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
