import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateUser } from '@/lib/user';
import { prisma } from '@/lib/db';

// GET - List user's schedule slots
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

    const slots = await prisma.scheduleSlot.findMany({
      where: { userId: user.id },
      include: {
        instagramAccount: {
          select: { instagramUsername: true },
        },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { timeOfDay: 'asc' }],
    });

    return NextResponse.json({ slots });
  } catch (error) {
    console.error('Error fetching schedule slots:', error);
    return NextResponse.json(
      { error: 'Failed to fetch schedule slots' },
      { status: 500 }
    );
  }
}

// POST - Create a new schedule slot
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
    const { instagramAccountId, dayOfWeek, timeOfDay, timezone } = body;

    // Validate inputs
    if (!instagramAccountId || dayOfWeek === undefined || !timeOfDay || !timezone) {
      return NextResponse.json(
        { error: 'Missing required fields: instagramAccountId, dayOfWeek, timeOfDay, timezone' },
        { status: 400 }
      );
    }

    if (typeof dayOfWeek !== 'number' || dayOfWeek < 0 || dayOfWeek > 6) {
      return NextResponse.json({ error: 'dayOfWeek must be 0-6' }, { status: 400 });
    }

    if (!/^\d{2}:\d{2}$/.test(timeOfDay)) {
      return NextResponse.json({ error: 'timeOfDay must be HH:MM format' }, { status: 400 });
    }

    // Verify account belongs to user
    const account = await prisma.instagramAccount.findFirst({
      where: { id: instagramAccountId, userId: user.id },
    });

    if (!account) {
      return NextResponse.json({ error: 'Instagram account not found' }, { status: 404 });
    }

    const slot = await prisma.scheduleSlot.create({
      data: {
        userId: user.id,
        instagramAccountId,
        dayOfWeek,
        timeOfDay,
        timezone,
      },
    });

    return NextResponse.json({ slot }, { status: 201 });
  } catch (error) {
    // Handle unique constraint violation (duplicate slot)
    if ((error as { code?: string }).code === 'P2002') {
      return NextResponse.json(
        { error: 'A slot already exists for this day and time' },
        { status: 409 }
      );
    }

    console.error('Error creating schedule slot:', error);
    return NextResponse.json(
      { error: 'Failed to create schedule slot' },
      { status: 500 }
    );
  }
}
