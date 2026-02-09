import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateUser } from '@/lib/user';
import { generateCaption } from '@/lib/captionGenerator';
import { prisma } from '@/lib/db';

/**
 * POST /api/captions/preview
 *
 * Generate caption previews for multiple videos at once (batch).
 * Used by the ScheduleModal to show captions before scheduling.
 */
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
    const { videoIds } = body;

    if (!Array.isArray(videoIds) || videoIds.length === 0) {
      return NextResponse.json({ error: 'videoIds array required' }, { status: 400 });
    }

    // Fetch videos with transcripts
    const videos = await prisma.video.findMany({
      where: {
        id: { in: videoIds },
        userId: user.id,
        status: 'COMPLETED',
      },
      select: {
        id: true,
        originalName: true,
        transcript: true,
      },
    });

    // Generate captions for each video
    const previews: Record<string, { caption: string; hashtags: string[] }> = {};

    for (const video of videos) {
      try {
        const generated = await generateCaption({
          transcript: video.transcript || video.originalName,
          userId: user.id,
          videoTitle: video.originalName,
        });
        previews[video.id] = {
          caption: generated.fullCaption,
          hashtags: generated.hashtags,
        };
      } catch {
        previews[video.id] = {
          caption: '',
          hashtags: [],
        };
      }
    }

    return NextResponse.json({ previews });
  } catch (error) {
    console.error('Caption preview error:', error);
    return NextResponse.json(
      { error: 'Failed to generate caption previews' },
      { status: 500 }
    );
  }
}
