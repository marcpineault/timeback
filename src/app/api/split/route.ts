import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { splitVideo } from '@/lib/ffmpeg';
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
    const { filename, splitPoints } = body;

    if (!filename || !splitPoints || !Array.isArray(splitPoints) || splitPoints.length === 0) {
      return NextResponse.json(
        { error: 'Missing filename or splitPoints' },
        { status: 400 }
      );
    }

    // Limit number of split points to prevent DoS
    const MAX_SPLIT_POINTS = 50;
    if (splitPoints.length > MAX_SPLIT_POINTS) {
      return NextResponse.json(
        { error: `Too many split points. Maximum is ${MAX_SPLIT_POINTS}` },
        { status: 400 }
      );
    }

    // Maximum video duration: ~27 hours (reasonable upper bound)
    const MAX_VIDEO_DURATION = 100000;

    // Validate split points are finite numbers within bounds
    if (!splitPoints.every((p: unknown) =>
      typeof p === 'number' &&
      Number.isFinite(p) &&
      p > 0 &&
      p < MAX_VIDEO_DURATION
    )) {
      return NextResponse.json(
        { error: 'Invalid split points' },
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
      console.error(`[Split API] Symlink attack detected: ${sanitizedFilename}`);
      return NextResponse.json(
        { error: 'Invalid file' },
        { status: 403 }
      );
    }

    // Generate base filename without extension
    const baseName = path.basename(sanitizedFilename, path.extname(sanitizedFilename));

    console.log(`[Split API] Splitting video at points: ${splitPoints.join(', ')}s`);

    const outputPaths = await splitVideo(inputPath, processedDir, splitPoints, baseName);

    // Generate download URLs for each part
    const parts = outputPaths.map((outputPath, index) => {
      const outputFilename = path.basename(outputPath);
      return {
        partNumber: index + 1,
        filename: outputFilename,
        downloadUrl: `/api/download/${outputFilename}`,
      };
    });

    // Optionally delete the original file after splitting
    try {
      fs.unlinkSync(inputPath);
      console.log('[Split API] Deleted original file after splitting');
    } catch (err) {
      console.error('[Split API] Error deleting original file:', err);
    }

    return NextResponse.json({
      success: true,
      parts,
    });
  } catch (error) {
    console.error('Split error:', error);
    return NextResponse.json(
      { error: 'Failed to split video' },
      { status: 500 }
    );
  }
}
