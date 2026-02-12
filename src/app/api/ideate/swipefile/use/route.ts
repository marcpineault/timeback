import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateUser } from '@/lib/user';
import { prisma } from '@/lib/db';

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
    const { entryId } = body;

    if (!entryId) {
      return NextResponse.json({ error: 'entryId is required' }, { status: 400 });
    }

    // Fetch the swipe entry
    const entry = await prisma.swipeEntry.findFirst({
      where: { id: entryId, userId: user.id },
    });

    if (!entry) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    // Create an Idea pre-filled from the swipe entry
    const idea = await prisma.idea.create({
      data: {
        userId: user.id,
        title: `From swipe: ${entry.hook.slice(0, 50)}${entry.hook.length > 50 ? '...' : ''}`,
        hook: entry.hook,
        angle: `${entry.source} — ${entry.analysis.slice(0, 200)}`,
        spclElements: {
          status: 'Adapt from swipe pattern',
          power: entry.meat.slice(0, 200),
          credibility: 'Reference the proven pattern',
          likeness: 'Make it authentic to your voice',
        },
        targetEmotion: 'curiosity',
        estimatedLength: 60,
      },
    });

    return NextResponse.json({ idea });
  } catch (error) {
    console.error('Error creating idea from swipe entry:', error);
    return NextResponse.json(
      { error: 'Failed to create idea from swipe entry' },
      { status: 500 }
    );
  }
}
