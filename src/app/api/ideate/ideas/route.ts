import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateUser, canGenerateIdeate, incrementIdeateCount } from '@/lib/user';
import { prisma } from '@/lib/db';
import { generateIdeas, type CreatorContext } from '@/lib/scriptGenerator';

export async function GET(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getOrCreateUser();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const where: Record<string, unknown> = { userId: user.id };
    if (status) {
      where.status = status;
    }

    const [ideas, total] = await Promise.all([
      prisma.idea.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.idea.count({ where }),
    ]);

    return NextResponse.json({ ideas, total });
  } catch (error) {
    console.error('Error fetching ideas:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ideas' },
      { status: 500 }
    );
  }
}

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
    const { topic, count = 5 } = body;

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

    // Generate ideas via Claude
    const generatedIdeas = await generateIdeas(
      creatorContext,
      user.id,
      topic || undefined,
      Math.min(count, 10)
    );

    // Save to database
    const savedIdeas = await Promise.all(
      generatedIdeas.map((idea) =>
        prisma.idea.create({
          data: {
            userId: user.id,
            title: idea.title,
            hook: idea.hook,
            hookVariations: idea.hookVariations || [],
            angle: idea.angle,
            contentType: idea.contentType || null,
            engagementPlay: idea.engagementPlay || null,
            spclElements: idea.spclElements,
            targetEmotion: idea.targetEmotion,
            estimatedLength: idea.estimatedLength,
          },
        })
      )
    );

    // Increment usage counter
    await incrementIdeateCount(user.id);

    return NextResponse.json({ ideas: savedIdeas });
  } catch (error) {
    console.error('Error generating ideas:', error);
    return NextResponse.json(
      { error: 'Failed to generate ideas' },
      { status: 500 }
    );
  }
}
