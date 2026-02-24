import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateUser } from '@/lib/user';
import { prisma } from '@/lib/db';

// GET - Fetch user's vertical onboarding state
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

    const verticalProfile = await prisma.verticalProfile.findUnique({
      where: { userId: user.id },
    });

    return NextResponse.json({
      vertical: user.vertical,
      verticalCompletedAt: user.verticalCompletedAt,
      verticalProfile: verticalProfile || null,
    });
  } catch (error) {
    console.error('Error fetching vertical onboarding:', error);
    return NextResponse.json(
      { error: 'Failed to fetch onboarding state' },
      { status: 500 }
    );
  }
}

// Mapping from specialization to pre-filled CreatorProfile fields
const SPECIALIZATION_PROFILES: Record<string, { niche: string; audiencePrefix: string }> = {
  first_time_buyers: {
    niche: 'Mortgage Broker - First-Time Buyers',
    audiencePrefix: 'First-time home buyers',
  },
  refinancing: {
    niche: 'Mortgage Broker - Refinancing & Renewals',
    audiencePrefix: 'Homeowners approaching mortgage renewal',
  },
  investment: {
    niche: 'Mortgage Broker - Investment Properties',
    audiencePrefix: 'Real estate investors and property buyers',
  },
  commercial: {
    niche: 'Mortgage Broker - Commercial Mortgages',
    audiencePrefix: 'Business owners and commercial property investors',
  },
  self_employed: {
    niche: 'Mortgage Broker - Self-Employed / Alt Lending',
    audiencePrefix: 'Self-employed professionals and non-traditional borrowers',
  },
};

// POST - Save vertical onboarding data and pre-fill CreatorProfile
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
    const { vertical, market, specialization } = body;

    if (!vertical || typeof vertical !== 'string') {
      return NextResponse.json({ error: 'vertical is required' }, { status: 400 });
    }

    const validVerticals = ['MORTGAGE_BROKER', 'FINANCIAL_ADVISOR', 'REAL_ESTATE_AGENT', 'OTHER'];
    if (!validVerticals.includes(vertical)) {
      return NextResponse.json({ error: 'Invalid vertical' }, { status: 400 });
    }

    // For "OTHER", just set the vertical and mark complete
    if (vertical === 'OTHER') {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          vertical: 'OTHER',
          verticalCompletedAt: new Date(),
        },
      });

      return NextResponse.json({ success: true, vertical: 'OTHER' });
    }

    // For specific verticals, validate required fields
    if (!market || !specialization) {
      return NextResponse.json(
        { error: 'market and specialization are required for this vertical' },
        { status: 400 }
      );
    }

    // Build pre-filled CreatorProfile data
    const specProfile = SPECIALIZATION_PROFILES[specialization] || {
      niche: 'Mortgage Broker',
      audiencePrefix: 'Home buyers and homeowners',
    };

    const targetAudience = `${specProfile.audiencePrefix} in ${market}`;

    // 1. Save user vertical + vertical profile in a transaction
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          vertical: vertical as 'MORTGAGE_BROKER' | 'FINANCIAL_ADVISOR' | 'REAL_ESTATE_AGENT',
          verticalCompletedAt: new Date(),
        },
      }),
      prisma.verticalProfile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          vertical,
          market,
          specialization,
          tone: '',
          postingFrequency: '',
        },
        update: {
          vertical,
          market,
          specialization,
        },
      }),
    ]);

    // 2. Pre-fill CreatorProfile (only fill empty fields)
    const existingProfile = await prisma.creatorProfile.findUnique({
      where: { userId: user.id },
    });

    if (existingProfile) {
      // Always update these fields during onboarding with vertical-specific values
      const updates: Record<string, string> = {
        niche: specProfile.niche,
        targetAudience: targetAudience,
        contentGoal: 'Get leads, build trust, establish expertise as a mortgage broker',
      };

      await prisma.creatorProfile.update({
        where: { userId: user.id },
        data: updates,
      });
    } else {
      // Create new profile with pre-filled values
      await prisma.creatorProfile.create({
        data: {
          userId: user.id,
          niche: specProfile.niche,
          targetAudience,
          contentGoal: 'Get leads, build trust, establish expertise as a mortgage broker',
        },
      });
    }

    return NextResponse.json({ success: true, vertical });
  } catch (error) {
    console.error('Error saving vertical onboarding:', error);
    return NextResponse.json(
      { error: 'Failed to save onboarding data' },
      { status: 500 }
    );
  }
}
