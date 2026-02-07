import { NextRequest, NextResponse } from 'next/server';
import { getProgress, cleanupExpiredProgress } from '@/lib/progressStore';

export async function GET(request: NextRequest) {
  const fileId = request.nextUrl.searchParams.get('fileId');

  if (!fileId) {
    return NextResponse.json({ error: 'Missing fileId parameter' }, { status: 400 });
  }

  // Opportunistic cleanup of expired entries
  cleanupExpiredProgress();

  const progress = getProgress(fileId);

  if (!progress) {
    return NextResponse.json({ progress: null });
  }

  return NextResponse.json({
    progress: {
      step: progress.step,
      totalSteps: progress.totalSteps,
      stepLabel: progress.stepLabel,
    },
  });
}
