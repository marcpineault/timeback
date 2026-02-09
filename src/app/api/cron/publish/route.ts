import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cronAuth';
import { publishDuePosts } from '@/lib/instagramPublisher';

// POST - Publish due posts (called by cron every minute)
export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await publishDuePosts();

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Cron publish error:', error);
    return NextResponse.json(
      { error: 'Publishing cron failed' },
      { status: 500 }
    );
  }
}

// Also support GET for simpler cron services (e.g., Vercel Cron)
export async function GET(request: NextRequest) {
  return POST(request);
}
