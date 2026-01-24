import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';

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

    const fileBuffer = fs.readFileSync(filepath);

    // Schedule file deletion after serving (give time for download to complete)
    // Delete after 5 minutes to allow for retries
    setTimeout(() => {
      try {
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
          console.log(`[Download] Cleaned up processed file: ${sanitizedFilename}`);
        }
      } catch (err) {
        console.error(`[Download] Failed to clean up file: ${sanitizedFilename}`, err);
      }
    }, 5 * 60 * 1000); // 5 minutes

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="${sanitizedFilename}"`,
        'Content-Length': stat.size.toString(),
      },
    });
  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json(
      { error: 'Failed to download file' },
      { status: 500 }
    );
  }
}
