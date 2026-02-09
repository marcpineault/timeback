import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateUser } from '@/lib/user';
import { prisma } from '@/lib/db';

// GET - List user's connected Instagram accounts
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

    const accounts = await prisma.instagramAccount.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        instagramUserId: true,
        instagramUsername: true,
        instagramProfilePic: true,
        facebookPageName: true,
        isActive: true,
        lastPublishedAt: true,
        lastError: true,
        tokenExpiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ accounts });
  } catch (error) {
    console.error('Error fetching Instagram accounts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch accounts' },
      { status: 500 }
    );
  }
}
