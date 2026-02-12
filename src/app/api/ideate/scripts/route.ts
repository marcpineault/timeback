import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateUser } from '@/lib/user';
import { prisma } from '@/lib/db';
import { generateScript, type CreatorContext } from '@/lib/scriptGenerator';

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
    const ideaId = searchParams.get('ideaId');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const where: Record<string, unknown> = { userId: user.id };
    if (status) where.status = status;
    if (ideaId) where.ideaId = ideaId;

    const scripts = await prisma.script.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        idea: { select: { title: true } },
      },
    });

    return NextResponse.json({ scripts });
  } catch (error) {
    console.error('Error fetching scripts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scripts' },
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

    const body = await request.json();
    const { ideaId, customInstructions } = body;

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

    // Fetch the idea
    const idea = await prisma.idea.findFirst({
      where: { id: ideaId, userId: user.id },
    });

    if (!idea) {
      return NextResponse.json({ error: 'Idea not found' }, { status: 404 });
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

    // Generate script via Claude
    const generated = await generateScript(
      creatorContext,
      user.id,
      {
        title: idea.title,
        hook: idea.hook,
        angle: idea.angle,
        spclElements: idea.spclElements as Record<string, string>,
        estimatedLength: idea.estimatedLength,
      },
      customInstructions || undefined
    );

    // Save script to database
    const script = await prisma.script.create({
      data: {
        userId: user.id,
        ideaId: idea.id,
        title: generated.title,
        hook: generated.hook,
        body: generated.body,
        cta: generated.cta,
        fullScript: generated.fullScript,
        estimatedDuration: generated.estimatedDuration,
        wordCount: generated.wordCount,
        spclBreakdown: generated.spclBreakdown,
      },
    });

    // Update idea status to SCRIPTED
    await prisma.idea.update({
      where: { id: idea.id },
      data: { status: 'SCRIPTED' },
    });

    return NextResponse.json({ script });
  } catch (error) {
    console.error('Error generating script:', error);
    return NextResponse.json(
      { error: 'Failed to generate script' },
      { status: 500 }
    );
  }
}
