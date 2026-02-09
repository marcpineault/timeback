import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateUser } from '@/lib/user';
import { prisma } from '@/lib/db';
import { getPostingQueue, assignVideoToNextSlot, getQueueStats } from '@/lib/scheduleQueue';
import { generateCaption } from '@/lib/captionGenerator';

// GET - Get the user's posting queue
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
    const includePublished = searchParams.get('includePublished') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const [queue, stats] = await Promise.all([
      getPostingQueue(user.id, { limit, includePublished }),
      getQueueStats(user.id),
    ]);

    return NextResponse.json({ queue, stats });
  } catch (error) {
    console.error('Error fetching queue:', error);
    return NextResponse.json(
      { error: 'Failed to fetch queue' },
      { status: 500 }
    );
  }
}

// POST - Add a video to the scheduling queue
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
    const { videoId, instagramAccountId, caption: providedCaption, autoGenerateCaption } = body;

    if (!videoId || !instagramAccountId) {
      return NextResponse.json(
        { error: 'Missing required fields: videoId, instagramAccountId' },
        { status: 400 }
      );
    }

    // Verify video belongs to user and is completed
    const video = await prisma.video.findFirst({
      where: { id: videoId, userId: user.id, status: 'COMPLETED' },
    });

    if (!video) {
      return NextResponse.json(
        { error: 'Video not found or not yet processed' },
        { status: 404 }
      );
    }

    // Verify account belongs to user
    const account = await prisma.instagramAccount.findFirst({
      where: { id: instagramAccountId, userId: user.id, isActive: true },
    });

    if (!account) {
      return NextResponse.json(
        { error: 'Instagram account not found or inactive' },
        { status: 404 }
      );
    }

    // Generate or use provided caption
    let caption = providedCaption || '';
    let hashtags: string[] = [];

    if (autoGenerateCaption || !providedCaption) {
      try {
        const generated = await generateCaption({
          transcript: video.transcript || video.originalName,
          userId: user.id,
          videoTitle: video.originalName,
        });
        caption = generated.fullCaption;
        hashtags = generated.hashtags;
      } catch (err) {
        console.error('Caption generation failed, using empty caption:', err);
        caption = providedCaption || '';
      }
    }

    // Assign to next available slot
    const result = await assignVideoToNextSlot({
      userId: user.id,
      videoId,
      instagramAccountId,
      caption,
      hashtags,
    });

    if (!result) {
      return NextResponse.json(
        { error: 'No available schedule slots. Please set up your posting schedule first.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      postId: result.postId,
      scheduledFor: result.scheduledFor,
    }, { status: 201 });
  } catch (error) {
    console.error('Error adding to queue:', error);
    return NextResponse.json(
      { error: 'Failed to add to queue' },
      { status: 500 }
    );
  }
}
