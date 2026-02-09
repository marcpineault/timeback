import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateUser } from '@/lib/user';
import { getValidToken } from '@/lib/instagram';
import { prisma } from '@/lib/db';

// POST - Manually refresh an Instagram account's token
export async function POST(
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

    await getValidToken(id);

    // Fetch updated account
    const updated = await prisma.instagramAccount.findUnique({
      where: { id },
      select: { tokenExpiresAt: true, isActive: true },
    });

    return NextResponse.json({
      success: true,
      tokenExpiresAt: updated?.tokenExpiresAt,
      isActive: updated?.isActive,
    });
  } catch (error) {
    console.error('Error refreshing token:', error);
    return NextResponse.json(
      { error: 'Failed to refresh token' },
      { status: 500 }
    );
  }
}
