import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { ensureVerticalDataSeeded } from '@/lib/seedVerticalData';

// GET - Fetch recommended script based on specialization
export async function GET(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Ensure seed data exists (runs once per server lifecycle)
    await ensureVerticalDataSeeded();

    const specialization = request.nextUrl.searchParams.get('specialization') || '';

    const scriptTitleMap: Record<string, string> = {
      first_time_buyers: 'Pre-Approved vs Pre-Qualified — Big Difference',
      refinancing: 'The Renewal Mistake Costing Canadians Thousands',
      investment: 'Fixed or Variable — Which One Right Now?',
      commercial: 'Fixed or Variable — Which One Right Now?',
      self_employed: "You Don't Need 20% Down",
    };

    const targetTitle = scriptTitleMap[specialization] || '5 Things to Do Before Applying for a Mortgage';

    const script = await prisma.scriptTemplate.findFirst({
      where: {
        vertical: 'MORTGAGE_BROKER',
        title: targetTitle,
        isActive: true,
      },
    });

    // Fallback: get any active mortgage broker script
    const fallback = script || await prisma.scriptTemplate.findFirst({
      where: {
        vertical: 'MORTGAGE_BROKER',
        isActive: true,
      },
      orderBy: { sortOrder: 'asc' },
    });

    return NextResponse.json({ script: fallback || null });
  } catch (error) {
    console.error('Error fetching recommended script:', error);
    return NextResponse.json(
      { error: 'Failed to fetch script' },
      { status: 500 }
    );
  }
}
