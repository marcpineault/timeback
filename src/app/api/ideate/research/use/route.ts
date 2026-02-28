import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateUser } from '@/lib/user';
import { prisma } from '@/lib/db';

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
    const { videoId } = body;

    if (!videoId) {
      return NextResponse.json({ error: 'videoId is required' }, { status: 400 });
    }

    // Fetch the research video
    const video = await prisma.topVideo.findFirst({
      where: { id: videoId, userId: user.id },
    });

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    // Create an Idea pre-filled from the research video
    const idea = await prisma.idea.create({
      data: {
        userId: user.id,
        title: `From research: ${video.adaptedHook.slice(0, 50)}${video.adaptedHook.length > 50 ? '...' : ''}`,
        hook: video.adaptedHook,
        hookVariations: video.adaptedHookVariations,
        angle: `${video.hookFormula} — ${video.whyItWorks.slice(0, 200)}`,
        contentType: video.contentType || null,
        engagementPlay: video.engagementDriver.includes('save')
          ? 'saves'
          : video.engagementDriver.includes('share')
            ? 'shares'
            : video.engagementDriver.includes('comment')
              ? 'comments'
              : 'follows',
        spclElements: {
          status: 'Adapt from proven viral pattern',
          power: video.contentStructure,
          credibility: `Based on video with ${video.likeCount} likes from @${video.creatorUsername || 'top creator'}`,
          likeness: video.adaptationNotes,
        },
        targetEmotion: video.targetEmotion || 'curiosity',
        estimatedLength: 60,
      },
    });

    // Mark as used
    await prisma.topVideo.update({
      where: { id: videoId },
      data: { isUsedAsIdea: true },
    });

    return NextResponse.json({ idea });
  } catch (error) {
    console.error('Error creating idea from research video:', error);
    return NextResponse.json(
      { error: 'Failed to create idea from research video' },
      { status: 500 }
    );
  }
}
