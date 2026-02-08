import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateUser } from '@/lib/user';
import { prisma } from '@/lib/db';

// PUT - Update a caption for a scheduled post
export async function PUT(
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
    const body = await request.json();
    const { caption, hashtags } = body;

    if (!caption) {
      return NextResponse.json({ error: 'Caption is required' }, { status: 400 });
    }

    // Verify post belongs to user
    const post = await prisma.scheduledPost.findFirst({
      where: { id: postId, userId: user.id },
    });

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    if (post.status === 'PUBLISHED' || post.status === 'UPLOADING') {
      return NextResponse.json(
        { error: 'Cannot edit caption of a published post' },
        { status: 400 }
      );
    }

    const updated = await prisma.scheduledPost.update({
      where: { id: postId },
      data: {
        caption,
        hashtags: hashtags || post.hashtags,
        captionGenerated: false,
      },
    });

    return NextResponse.json({ post: updated });
  } catch (error) {
    console.error('Error updating caption:', error);
    return NextResponse.json(
      { error: 'Failed to update caption' },
      { status: 500 }
    );
  }
}
