import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateUser, canGenerateIdeate, incrementIdeateCount } from '@/lib/user';
import { prisma } from '@/lib/db';
import { generateSwipeEntries } from '@/lib/swipeFileGenerator';
import type { CreatorContext } from '@/lib/scriptGenerator';

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getOrCreateUser();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check ideate generation limit
    const { allowed, reason } = await canGenerateIdeate(user.id);
    if (!allowed) {
      return NextResponse.json({ error: reason }, { status: 403 });
    }

    const body = await request.json();
    const { category, topic, count = 5 } = body;

    // Fetch creator profile
    const profile = await prisma.creatorProfile.findUnique({
      where: { userId: user.id },
    });

    if (!profile || !profile.isComplete) {
      return NextResponse.json(
        { error: 'Please complete your creator profile first' },
        { status: 400 }
      );
    }

    const creatorContext: CreatorContext = {
      niche: profile.niche,
      targetAudience: profile.targetAudience,
      contentGoal: profile.contentGoal,
      statusProof: profile.statusProof,
      powerExamples: profile.powerExamples,
      credibilityMarkers: profile.credibilityMarkers,
      likenessTraits: profile.likenessTraits,
      toneOfVoice: profile.toneOfVoice,
      personalCatchphrases: profile.personalCatchphrases,
      avoidTopics: profile.avoidTopics,
      exampleScripts: profile.exampleScripts,
      primaryPlatform: profile.primaryPlatform,
      typicalVideoLength: profile.typicalVideoLength,
    };

    // Generate entries via Claude
    const generated = await generateSwipeEntries(
      creatorContext,
      user.id,
      category || undefined,
      topic || undefined,
      Math.min(count, 10)
    );

    // Save to database
    const entries = await Promise.all(
      generated.map((entry) =>
        prisma.swipeEntry.create({
          data: {
            userId: user.id,
            hook: entry.hook,
            meat: entry.meat,
            cta: entry.cta,
            fullExample: entry.fullExample,
            analysis: entry.analysis,
            source: entry.source,
            category: entry.category,
            format: entry.format,
            niche: profile.niche,
            tags: entry.tags,
          },
        })
      )
    );

    // Increment usage counter
    await incrementIdeateCount(user.id);

    return NextResponse.json({ entries });
  } catch (error) {
    console.error('Error generating swipe entries:', error);
    return NextResponse.json(
      { error: 'Failed to generate swipe entries' },
      { status: 500 }
    );
  }
}
