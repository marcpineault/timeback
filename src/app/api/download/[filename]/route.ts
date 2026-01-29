import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { createReadStream } from 'fs';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { isS3Configured, getProcessedVideoUrl } from '@/lib/s3';

// Cleanup registry for local files: Map of filepath -> scheduled deletion timestamp
// Uses a single interval instead of unbounded setTimeouts to prevent memory leaks
const cleanupRegistry = new Map<string, number>();
let cleanupIntervalStarted = false;
const CLEANUP_DELAY_MS = 5 * 60 * 1000; // 5 minutes
const CLEANUP_CHECK_INTERVAL_MS = 60 * 1000; // Check every minute

function scheduleFileCleanup(filepath: string) {
  cleanupRegistry.set(filepath, Date.now() + CLEANUP_DELAY_MS);

  // Start the cleanup interval if not already running
  if (!cleanupIntervalStarted) {
    cleanupIntervalStarted = true;
    setInterval(() => {
      const now = Date.now();
      const toDelete: string[] = [];

      for (const [path, scheduledTime] of cleanupRegistry.entries()) {
        if (now >= scheduledTime) {
          toDelete.push(path);
        }
      }

      for (const path of toDelete) {
        cleanupRegistry.delete(path);
        try {
          if (fs.existsSync(path)) {
            fs.unlinkSync(path);
            console.log(`[Download] Cleaned up processed file: ${path}`);
          }
        } catch (err) {
          console.error(`[Download] Failed to clean up file: ${path}`, err);
        }
      }
    }, CLEANUP_CHECK_INTERVAL_MS);
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    // Authentication check
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { filename } = await params;

    // Sanitize filename to prevent directory traversal
    const sanitizedFilename = path.basename(filename);

    // Verify ownership: check that the user owns this video
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Find video by looking for either:
    // 1. Local path format: /api/download/{filename}
    // 2. S3 key format: processed/{timestamp}-{id}-{filename}
    const expectedLocalUrl = `/api/download/${sanitizedFilename}`;

    // First try exact match on local URL format
    let video = await prisma.video.findFirst({
      where: {
        userId: user.id,
        processedUrl: expectedLocalUrl,
      },
    });

    // If not found, try finding by S3 key that ends with the filename
    if (!video) {
      video = await prisma.video.findFirst({
        where: {
          userId: user.id,
          processedUrl: {
            endsWith: sanitizedFilename,
          },
        },
      });
    }

    if (!video || !video.processedUrl) {
      return NextResponse.json(
        { error: 'Video not found or access denied' },
        { status: 403 }
      );
    }

    // Check if the processedUrl is an S3 key (starts with "processed/")
    const isS3Key = video.processedUrl.startsWith('processed/');

    if (isS3Key && isS3Configured()) {
      // Serve from R2 via presigned URL redirect
      console.log(`[Download] Serving from R2: ${video.processedUrl}`);
      const presignedUrl = await getProcessedVideoUrl(video.processedUrl);

      // Redirect to the presigned URL for fast CDN download
      return NextResponse.redirect(presignedUrl);
    }

    // Fallback: Serve from local filesystem
    const processedDir = process.env.PROCESSED_DIR || path.join(process.cwd(), 'processed');
    const filepath = path.join(processedDir, sanitizedFilename);

    if (!fs.existsSync(filepath)) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    // Security: Check for symlink attacks
    const stat = fs.lstatSync(filepath);
    if (stat.isSymbolicLink()) {
      console.error(`[Download] Symlink attack detected: ${sanitizedFilename}`);
      return NextResponse.json(
        { error: 'Invalid file' },
        { status: 403 }
      );
    }

    // Schedule file cleanup using the registry (avoids memory leaks from unbounded timers)
    scheduleFileCleanup(filepath);

    // Stream the file instead of loading entirely into memory (better for large videos)
    const stream = createReadStream(filepath);
    const webStream = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk) => {
          try {
            controller.enqueue(chunk);
          } catch {
            // Controller closed (client disconnected), clean up the file stream
            stream.destroy();
          }
        });
        stream.on('end', () => {
          try {
            controller.close();
          } catch {
            // Controller already closed
          }
        });
        stream.on('error', (err) => {
          console.error('[Download] Stream error:', err.message);
          try {
            controller.error(err);
          } catch {
            // Controller already closed
          }
        });
      },
      cancel() {
        // Client disconnected, clean up the file stream
        stream.destroy();
      },
    });

    return new NextResponse(webStream, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="${sanitizedFilename}"`,
        'Content-Length': stat.size.toString(),
      },
    });
  } catch (error) {
    console.error('Download error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to download file', details: message },
      { status: 500 }
    );
  }
}
