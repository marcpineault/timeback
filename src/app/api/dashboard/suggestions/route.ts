import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateUser } from '@/lib/user';
import { prisma } from '@/lib/db';
import { ensureVerticalDataSeeded } from '@/lib/seedVerticalData';

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

    if (!user.vertical || user.vertical === 'OTHER') {
      return NextResponse.json({ vertical: user.vertical || null, weeklySuggestion: null, templates: [] });
    }

    // Ensure seed data exists (runs once per server lifecycle)
    await ensureVerticalDataSeeded();

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat

    // 1. Find calendar entries for this month with specific_date within next 7 days
    const sevenDaysFromNow = new Date(now);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const upcomingDated = await prisma.contentCalendar.findMany({
      where: {
        vertical: user.vertical,
        month: currentMonth,
        specificDate: {
          gte: now,
          lte: sevenDaysFromNow,
        },
      },
      orderBy: { specificDate: 'asc' },
      take: 1,
    });

    let weeklySuggestion: {
      type: 'dated' | 'rotating';
      calendarEntry?: {
        id: string;
        title: string;
        contentAngle: string;
        category: string;
        specificDate: string | null;
      };
      template?: {
        id: string;
        title: string;
        category: string;
      };
      dayLabel?: string;
    } | null = null;

    if (upcomingDated.length > 0) {
      const entry = upcomingDated[0];

      // Find a matching template for the category
      const matchingTemplate = await prisma.scriptTemplate.findFirst({
        where: { vertical: user.vertical, category: entry.category, isActive: true },
        select: { id: true, title: true, category: true },
      });

      weeklySuggestion = {
        type: 'dated',
        calendarEntry: {
          id: entry.id,
          title: entry.title,
          contentAngle: entry.contentAngle,
          category: entry.category,
          specificDate: entry.specificDate?.toISOString() || null,
        },
        template: matchingTemplate || undefined,
      };
    } else {
      // Rotating suggestion based on day of week
      let suggestCategory: string;
      let dayLabel: string;

      if (dayOfWeek === 1) {
        // Monday → Educational
        suggestCategory = Math.random() > 0.5 ? 'first_time_buyers' : 'myths';
        dayLabel = 'Monday: Educational content';
      } else if (dayOfWeek === 3) {
        // Wednesday → Timely/Reactive
        suggestCategory = 'rate_reactions';
        dayLabel = 'Wednesday: Timely content';
      } else if (dayOfWeek === 5) {
        // Friday → Personal
        suggestCategory = 'personal';
        dayLabel = 'Friday: Personal content';
      } else {
        // Other days → random pick
        const categories = ['first_time_buyers', 'myths', 'rate_reactions', 'renewals', 'personal'];
        suggestCategory = categories[Math.floor(Math.random() * categories.length)];
        dayLabel = 'Suggested for today';
      }

      const template = await prisma.scriptTemplate.findFirst({
        where: { vertical: user.vertical, category: suggestCategory, isActive: true },
        select: { id: true, title: true, category: true },
        orderBy: { sortOrder: 'asc' },
      });

      // Also grab a calendar entry for context
      const calEntry = await prisma.contentCalendar.findFirst({
        where: { vertical: user.vertical, month: currentMonth, category: suggestCategory },
        select: { id: true, title: true, contentAngle: true, category: true, specificDate: true },
      });

      if (template || calEntry) {
        weeklySuggestion = {
          type: 'rotating',
          dayLabel,
          template: template || undefined,
          calendarEntry: calEntry ? {
            ...calEntry,
            specificDate: calEntry.specificDate?.toISOString() || null,
          } : undefined,
        };
      }
    }

    // 2. Get 3 random-ish script templates (rotate daily using date as seed)
    const allTemplates = await prisma.scriptTemplate.findMany({
      where: { vertical: user.vertical, isActive: true },
      select: { id: true, title: true, category: true },
    });

    // Simple daily rotation: use day-of-year to offset
    const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
    const shuffled = allTemplates
      .map((t, i) => ({ ...t, sortKey: ((i + dayOfYear) * 2654435761) % allTemplates.length }))
      .sort((a, b) => a.sortKey - b.sortKey)
      .slice(0, 3);

    return NextResponse.json({
      vertical: user.vertical,
      weeklySuggestion,
      templates: shuffled,
    });
  } catch (error) {
    console.error('Error fetching dashboard suggestions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch suggestions' },
      { status: 500 }
    );
  }
}
