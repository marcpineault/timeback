import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cronAuth';
import { refreshExpiringTokens } from '@/lib/instagramPublisher';

// POST - Refresh expiring Instagram tokens (called by daily cron)
export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await refreshExpiringTokens();

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Token refresh cron error:', error);
    return NextResponse.json(
      { error: 'Token refresh cron failed' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
