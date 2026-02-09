import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateUser } from '@/lib/user';
import { prisma } from '@/lib/db';
import { regenerateCaption } from '@/lib/captionGenerator';

// POST - Regenerate caption for a scheduled post
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getOrCreateUser();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { postId } = await params;
    const body = await request.json().catch(() => ({}));
    const { styleOverride } = body;

    // Verify post belongs to user
    const post = await prisma.scheduledPost.findFirst({
      where: { id: postId, userId: user.id },
      include: { video: { select: { originalName: true, transcript: true } } },
    });

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    if (post.status === 'PUBLISHED' || post.status === 'UPLOADING') {
      return NextResponse.json(
        { error: 'Cannot regenerate caption for a published post' },
        { status: 400 }
      );
    }

    const generated = await regenerateCaption({
      transcript: post.video.transcript || post.video.originalName,
      userId: user.id,
      videoTitle: post.video.originalName,
      styleOverride,
    });

    // Update the post with the new caption
    const updated = await prisma.scheduledPost.update({
      where: { id: postId },
      data: {
        caption: generated.fullCaption,
        hashtags: generated.hashtags,
        captionGenerated: true,
      },
    });

    return NextResponse.json({
      caption: generated,
      post: updated,
    });
  } catch (error) {
    console.error('Error regenerating caption:', error);
    return NextResponse.json(
      { error: 'Failed to regenerate caption' },
      { status: 500 }
    );
  }
}
