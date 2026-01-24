import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { trimVideo } from '@/lib/ffmpeg';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { filename, startTime, endTime } = body;

    if (!filename || startTime === undefined || endTime === undefined) {
      return NextResponse.json(
        { error: 'Missing filename, startTime, or endTime' },
        { status: 400 }
      );
    }

    // Maximum video duration: ~27 hours (reasonable upper bound)
    const MAX_VIDEO_DURATION = 100000;

    if (
      typeof startTime !== 'number' ||
      typeof endTime !== 'number' ||
      !Number.isFinite(startTime) ||
      !Number.isFinite(endTime) ||
      startTime < 0 ||
      endTime <= startTime ||
      endTime > MAX_VIDEO_DURATION
    ) {
      return NextResponse.json(
        { error: 'Invalid trim times' },
        { status: 400 }
      );
    }

    // Sanitize filename to prevent path traversal
    const sanitizedFilename = path.basename(filename);

    // Verify ownership: check that the user owns this video
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const video = await prisma.video.findFirst({
      where: {
        userId: user.id,
        processedUrl: { endsWith: sanitizedFilename },
      },
    });

    if (!video) {
      return NextResponse.json(
        { error: 'Video not found or access denied' },
        { status: 403 }
      );
    }

    const processedDir = process.env.PROCESSED_DIR || path.join(process.cwd(), 'processed');
    const inputPath = path.join(processedDir, sanitizedFilename);

    if (!fs.existsSync(inputPath)) {
      return NextResponse.json(
        { error: 'Video file not found' },
        { status: 404 }
      );
    }

    // Security: Check for symlink attacks
    const fileStat = fs.lstatSync(inputPath);
    if (fileStat.isSymbolicLink()) {
      console.error(`[Trim API] Symlink attack detected: ${sanitizedFilename}`);
      return NextResponse.json(
        { error: 'Invalid file' },
        { status: 403 }
      );
    }

    // Generate output filename with _trimmed suffix
    const baseName = path.basename(sanitizedFilename, path.extname(sanitizedFilename));
    const outputFilename = `${baseName}_trimmed.mp4`;
    const outputPath = path.join(processedDir, outputFilename);

    console.log(`[Trim API] Trimming video from ${startTime}s to ${endTime}s`);

    await trimVideo(inputPath, outputPath, startTime, endTime);

    // Delete the original file and rename trimmed to take its place
    try {
      fs.unlinkSync(inputPath);
      fs.renameSync(outputPath, inputPath);
      console.log('[Trim API] Replaced original with trimmed version');
    } catch (err) {
      console.error('[Trim API] Error replacing file:', err);
      // If rename fails, just use the trimmed file
    }

    return NextResponse.json({
      success: true,
      filename: sanitizedFilename,
      downloadUrl: `/api/download/${sanitizedFilename}`,
    });
  } catch (error) {
    console.error('Trim error:', error);
    return NextResponse.json(
      { error: 'Failed to trim video' },
      { status: 500 }
    );
  }
}
