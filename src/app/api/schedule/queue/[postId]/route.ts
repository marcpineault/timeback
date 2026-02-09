import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateUser } from '@/lib/user';
import { prisma } from '@/lib/db';

// PUT - Update a queued post (caption, scheduled time, etc.)
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

    // Verify post belongs to user
    const post = await prisma.scheduledPost.findFirst({
      where: { id: postId, userId: user.id },
    });

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Only allow edits on posts that haven't been published
    if (post.status === 'PUBLISHED' || post.status === 'UPLOADING') {
      return NextResponse.json(
        { error: 'Cannot edit a published or uploading post' },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (body.caption !== undefined) {
      updateData.caption = body.caption;
      updateData.captionGenerated = false; // User edited it
    }
    if (body.hashtags !== undefined) updateData.hashtags = body.hashtags;
    if (body.scheduledFor !== undefined) updateData.scheduledFor = new Date(body.scheduledFor);
    if (body.coverImageUrl !== undefined) updateData.coverImageUrl = body.coverImageUrl;

    const updated = await prisma.scheduledPost.update({
      where: { id: postId },
      data: updateData,
      include: {
        video: { select: { originalName: true, processedUrl: true } },
      },
    });

    return NextResponse.json({ post: updated });
  } catch (error) {
    console.error('Error updating post:', error);
    return NextResponse.json(
      { error: 'Failed to update post' },
      { status: 500 }
    );
  }
}

// DELETE - Remove a post from the queue
export async function DELETE(
  _request: NextRequest,
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

    const post = await prisma.scheduledPost.findFirst({
      where: { id: postId, userId: user.id },
    });

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    if (post.status === 'PUBLISHED') {
      return NextResponse.json(
        { error: 'Cannot delete a published post' },
        { status: 400 }
      );
    }

    await prisma.scheduledPost.update({
      where: { id: postId },
      data: { status: 'CANCELLED' },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing post:', error);
    return NextResponse.json(
      { error: 'Failed to remove post' },
      { status: 500 }
    );
  }
}
