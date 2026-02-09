import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateUser } from '@/lib/user';
import { prisma } from '@/lib/db';

// GET - Fetch user's caption preferences
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

    const preferences = await prisma.captionPreferences.findUnique({
      where: { userId: user.id },
    });

    return NextResponse.json({
      preferences: preferences || null,
      isDefault: !preferences,
    });
  } catch (error) {
    console.error('Error fetching caption preferences:', error);
    return NextResponse.json(
      { error: 'Failed to fetch caption preferences' },
      { status: 500 }
    );
  }
}

// PUT - Save caption preferences
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
      brandVoice: body.brandVoice ?? 'casual',
      niche: body.niche ?? '',
      captionStyle: body.captionStyle ?? 'hook-based',
      hashtagCount: body.hashtagCount ?? 25,
      customHashtags: body.customHashtags ?? [],
      blockedHashtags: body.blockedHashtags ?? [],
      defaultCTA: body.defaultCTA ?? '',
      includeCTA: body.includeCTA ?? true,
      exampleCaptions: body.exampleCaptions ?? [],
    };

    const preferences = await prisma.captionPreferences.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...data },
      update: data,
    });

    return NextResponse.json({ success: true, preferences });
  } catch (error) {
    console.error('Error saving caption preferences:', error);
    return NextResponse.json(
      { error: 'Failed to save caption preferences' },
      { status: 500 }
    );
  }
}
