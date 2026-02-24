import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateUser } from '@/lib/user';
import { prisma } from '@/lib/db';
import { ensureVerticalDataSeeded } from '@/lib/seedVerticalData';

// GET - Fetch content calendar entries for user's vertical
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

    if (!user.vertical) {
      return NextResponse.json({ entries: [], vertical: null });
    }

    // Ensure seed data exists (runs once per server lifecycle)
    await ensureVerticalDataSeeded();

    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');

    const where: Record<string, unknown> = {
      vertical: user.vertical,
    };
    if (month) where.month = parseInt(month, 10);

    const entries = await prisma.contentCalendar.findMany({
      where,
      orderBy: [{ month: 'asc' }, { specificDate: 'asc' }],
    });

    // Fetch categories that have templates available (for "Get Script" linking)
    const templateCategories = await prisma.scriptTemplate.findMany({
      where: { vertical: user.vertical, isActive: true },
      select: { category: true },
      distinct: ['category'],
    });

    return NextResponse.json({
      entries,
      vertical: user.vertical,
      availableTemplateCategories: templateCategories.map(t => t.category),
    });
  } catch (error) {
    console.error('Error fetching calendar:', error);
    return NextResponse.json(
      { error: 'Failed to fetch calendar' },
      { status: 500 }
    );
  }
}
