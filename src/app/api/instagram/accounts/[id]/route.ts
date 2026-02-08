import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateUser } from '@/lib/user';
import { prisma } from '@/lib/db';

// DELETE - Disconnect an Instagram account
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const { id } = await params;

    // Verify account belongs to user
    const account = await prisma.instagramAccount.findFirst({
      where: { id, userId: user.id },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Cancel all pending/scheduled posts for this account
    await prisma.scheduledPost.updateMany({
      where: {
        instagramAccountId: id,
        status: { in: ['QUEUED', 'SCHEDULED'] },
      },
      data: { status: 'CANCELLED' },
    });

    // Delete the account (cascades to schedule slots)
    await prisma.instagramAccount.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error disconnecting Instagram account:', error);
    return NextResponse.json(
      { error: 'Failed to disconnect account' },
      { status: 500 }
    );
  }
}
