import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateUser } from '@/lib/user';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getOrCreateUser();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const profile = await prisma.creatorProfile.findUnique({
      where: { userId: user.id },
    });

    return NextResponse.json({
      profile: profile || null,
      isComplete: profile?.isComplete ?? false,
    });
  } catch (error) {
    console.error('Error fetching creator profile:', error);
    return NextResponse.json(
      { error: 'Failed to fetch creator profile' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
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

    const data = {
      niche: body.niche ?? '',
      targetAudience: body.targetAudience ?? '',
      contentGoal: body.contentGoal ?? '',
      statusProof: body.statusProof ?? [],
      powerExamples: body.powerExamples ?? [],
      credibilityMarkers: body.credibilityMarkers ?? [],
      likenessTraits: body.likenessTraits ?? [],
      toneOfVoice: body.toneOfVoice ?? 'direct',
      personalCatchphrases: body.personalCatchphrases ?? [],
      avoidTopics: body.avoidTopics ?? [],
      exampleScripts: body.exampleScripts ?? [],
      primaryPlatform: body.primaryPlatform ?? 'instagram',
      typicalVideoLength: body.typicalVideoLength ?? 60,
      isComplete: !!(body.niche && body.targetAudience),
    };

    const profile = await prisma.creatorProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...data },
      update: data,
    });

    return NextResponse.json({ success: true, profile });
  } catch (error) {
    console.error('Error saving creator profile:', error);
    return NextResponse.json(
      { error: 'Failed to save creator profile' },
      { status: 500 }
    );
  }
}
