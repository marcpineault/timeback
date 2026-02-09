import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateUser } from '@/lib/user';
import { prisma } from '@/lib/db';

// PUT - Update a schedule slot
export async function PUT(
  request: NextRequest,
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
    const body = await request.json();

    // Verify slot belongs to user
    const existing = await prisma.scheduleSlot.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Slot not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.dayOfWeek !== undefined) updateData.dayOfWeek = body.dayOfWeek;
    if (body.timeOfDay !== undefined) updateData.timeOfDay = body.timeOfDay;
    if (body.timezone !== undefined) updateData.timezone = body.timezone;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;

    const slot = await prisma.scheduleSlot.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ slot });
  } catch (error) {
    console.error('Error updating schedule slot:', error);
    return NextResponse.json(
      { error: 'Failed to update schedule slot' },
      { status: 500 }
    );
  }
}

// DELETE - Remove a schedule slot
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

    const existing = await prisma.scheduleSlot.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Slot not found' }, { status: 404 });
    }

    await prisma.scheduleSlot.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting schedule slot:', error);
    return NextResponse.json(
      { error: 'Failed to delete schedule slot' },
      { status: 500 }
    );
  }
}
