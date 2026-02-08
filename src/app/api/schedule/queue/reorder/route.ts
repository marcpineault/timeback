import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateUser } from '@/lib/user';
import { reorderQueue } from '@/lib/scheduleQueue';

// POST - Reorder the posting queue
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
    const { instagramAccountId, orderedPostIds } = body;

    if (!instagramAccountId || !Array.isArray(orderedPostIds) || orderedPostIds.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: instagramAccountId, orderedPostIds (array)' },
        { status: 400 }
      );
    }

    await reorderQueue(user.id, instagramAccountId, orderedPostIds);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error reordering queue:', error);
    return NextResponse.json(
      { error: 'Failed to reorder queue' },
      { status: 500 }
    );
  }
}
