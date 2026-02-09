import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateUser } from '@/lib/user';
import { prisma } from '@/lib/db';
import { findNextOpenSlot } from '@/lib/scheduleQueue';

/**
 * GET /api/schedule/preflight
 *
 * Returns everything the frontend needs to show the pre-schedule
 * confirmation: connected accounts, slot count, next N available times.
 */
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
    const videoCount = parseInt(searchParams.get('videoCount') || '1', 10);

    // Get connected Instagram accounts
    const accounts = await prisma.instagramAccount.findMany({
      where: { userId: user.id, isActive: true },
      select: {
        id: true,
        instagramUsername: true,
        instagramProfilePic: true,
      },
    });

    if (accounts.length === 0) {
      return NextResponse.json({
        ready: false,
        reason: 'no_account',
        accounts: [],
        slots: [],
        nextSlots: [],
      });
    }

    const accountId = accounts[0].id;

    // Get schedule slots
    const slots = await prisma.scheduleSlot.findMany({
      where: { userId: user.id, instagramAccountId: accountId, isActive: true },
      orderBy: [{ dayOfWeek: 'asc' }, { timeOfDay: 'asc' }],
    });

    if (slots.length === 0) {
      return NextResponse.json({
        ready: false,
        reason: 'no_slots',
        accounts,
        slots: [],
        nextSlots: [],
      });
    }

    // Find the next N available slot times
    const nextSlots: Date[] = [];
    let searchFrom = new Date();

    for (let i = 0; i < Math.min(videoCount, 20); i++) {
      const next = await findNextOpenSlot(user.id, accountId, searchFrom);
      if (!next) break;
      nextSlots.push(next);
      // Move search forward past this slot by 1 minute to find the next one
      searchFrom = new Date(next.getTime() + 60000);
    }

    return NextResponse.json({
      ready: true,
      accounts,
      slots,
      nextSlots: nextSlots.map((d) => d.toISOString()),
      slotsPerWeek: slots.length,
      daysOfContent: videoCount > 0 && slots.length > 0
        ? Math.ceil(videoCount / (slots.length / 7))
        : 0,
    });
  } catch (error) {
    console.error('Preflight error:', error);
    return NextResponse.json(
      { error: 'Failed to check scheduling readiness' },
      { status: 500 }
    );
  }
}
