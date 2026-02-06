import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { cleanupStaleMultipartUploads } from '@/lib/s3';

/**
 * POST /api/cleanup-uploads
 * Aborts all incomplete multipart uploads in R2.
 * Requires authentication.
 */
export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Abort ALL incomplete multipart uploads (maxAge = 0 means everything)
    const abortedCount = await cleanupStaleMultipartUploads(0);

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
