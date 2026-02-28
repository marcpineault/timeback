import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateUser } from '@/lib/user';
import { prisma } from '@/lib/db';

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
    const saved = searchParams.get('saved');
    const searchType = searchParams.get('searchType');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const where: Record<string, unknown> = { userId: user.id };
    if (saved === 'true') {
      where.isSaved = true;
    }
    if (searchType) {
      where.search = { searchType };
    }

    const [videos, total] = await Promise.all([
      prisma.topVideo.findMany({
        where,
        include: {
          search: {
            select: {
              id: true,
              searchType: true,
              query: true,
              creatorUsername: true,
              creatorFollowers: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.topVideo.count({ where }),
    ]);

    return NextResponse.json({ videos, total });
  } catch (error) {
    console.error('Error fetching research videos:', error);
    return NextResponse.json(
      { error: 'Failed to fetch research videos' },
      { status: 500 }
    );
  }
}
