import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateUser } from '@/lib/user';
import { prisma } from '@/lib/db';

// Quick setup presets for posting schedule
const QUICK_PRESETS: Record<string, { times: string[] }> = {
  '1x': { times: ['12:00'] },
  '2x': { times: ['09:00', '18:00'] },
  '3x': { times: ['09:00', '13:00', '18:00'] },
};

// POST - Quick setup schedule slots
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
    const { preset, instagramAccountId, timezone, days } = body;

    if (!preset || !instagramAccountId || !timezone) {
      return NextResponse.json(
        { error: 'Missing required fields: preset, instagramAccountId, timezone' },
        { status: 400 }
      );
    }

    const presetConfig = QUICK_PRESETS[preset];
    if (!presetConfig) {
      return NextResponse.json(
        { error: `Invalid preset. Choose from: ${Object.keys(QUICK_PRESETS).join(', ')}` },
        { status: 400 }
      );
    }

    // Verify account belongs to user
    const account = await prisma.instagramAccount.findFirst({
      where: { id: instagramAccountId, userId: user.id },
    });

    if (!account) {
      return NextResponse.json({ error: 'Instagram account not found' }, { status: 404 });
    }

    // Default: all 7 days. User can pass specific days like [1,2,3,4,5] for weekdays
    const activeDays: number[] = days || [0, 1, 2, 3, 4, 5, 6];

    // Delete existing slots for this account
    await prisma.scheduleSlot.deleteMany({
      where: { userId: user.id, instagramAccountId },
    });

    // Create new slots
    const slotsToCreate = [];
    for (const day of activeDays) {
      for (const time of presetConfig.times) {
        slotsToCreate.push({
          userId: user.id,
          instagramAccountId,
          dayOfWeek: day,
          timeOfDay: time,
          timezone,
        });
      }
    }

    await prisma.scheduleSlot.createMany({ data: slotsToCreate });

    const slots = await prisma.scheduleSlot.findMany({
      where: { userId: user.id, instagramAccountId },
      orderBy: [{ dayOfWeek: 'asc' }, { timeOfDay: 'asc' }],
    });

    return NextResponse.json({
      success: true,
      slotsCreated: slots.length,
      slots,
    });
  } catch (error) {
    console.error('Error creating quick schedule:', error);
    return NextResponse.json(
      { error: 'Failed to create schedule' },
      { status: 500 }
    );
  }
}
