import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateUser } from '@/lib/user';
import { prisma } from '@/lib/db';

// GET - Get published post history
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
    const limit = parseInt(searchParams.get('limit') || '25', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const [posts, total] = await Promise.all([
      prisma.scheduledPost.findMany({
        where: {
          userId: user.id,
          status: { in: ['PUBLISHED', 'FAILED'] },
        },
        include: {
          video: {
            select: { originalName: true, processedUrl: true },
          },
          instagramAccount: {
            select: { instagramUsername: true, instagramProfilePic: true },
          },
        },
        orderBy: { publishedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.scheduledPost.count({
        where: {
          userId: user.id,
          status: { in: ['PUBLISHED', 'FAILED'] },
        },
      }),
    ]);

    return NextResponse.json({ posts, total });
  } catch (error) {
    console.error('Error fetching history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch history' },
      { status: 500 }
    );
  }
}
