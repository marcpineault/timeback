import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { cleanupStaleMultipartUploads } from '@/lib/s3';

/**
 * POST /api/cleanup-uploads
 * Aborts stale incomplete multipart uploads in R2.
 * Requires authentication. Only cleans up uploads older than 1 hour
 * to avoid disrupting other users' in-progress uploads.
 */
export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // SECURITY: Only abort multipart uploads older than 1 hour to avoid
    // disrupting other users' in-progress uploads
    const ONE_HOUR_MS = 60 * 60 * 1000;
    const abortedCount = await cleanupStaleMultipartUploads(ONE_HOUR_MS);

    return NextResponse.json({
      success: true,
      abortedCount,
      message: abortedCount > 0
        ? `Cleaned up ${abortedCount} incomplete multipart upload(s)`
        : 'No incomplete multipart uploads found',
    });
  } catch (error) {
    console.error('Cleanup uploads error:', error);
    return NextResponse.json(
      { error: 'Failed to cleanup uploads' },
      { status: 500 },
    );
  }
}
