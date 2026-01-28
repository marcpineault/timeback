import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import JSZip from 'jszip';

export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { filenames } = body as { filenames: string[] };

    if (!filenames || !Array.isArray(filenames) || filenames.length === 0) {
      return NextResponse.json(
        { error: 'No files specified' },
        { status: 400 }
      );
    }

    // Limit to prevent abuse
    if (filenames.length > 50) {
      return NextResponse.json(
        { error: 'Too many files. Maximum is 50.' },
        { status: 400 }
      );
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const processedDir = process.env.PROCESSED_DIR || path.join(process.cwd(), 'processed');
    const zip = new JSZip();
    const addedFiles: string[] = [];

    for (const filename of filenames) {
      // Sanitize filename to prevent directory traversal
      const sanitizedFilename = path.basename(filename);

      // Verify ownership
      const expectedUrl = `/api/download/${sanitizedFilename}`;
      const video = await prisma.video.findFirst({
        where: {
          userId: user.id,
          processedUrl: expectedUrl,
        },
      });

      if (!video) {
        console.warn(`[BulkDownload] Skipping unauthorized file: ${sanitizedFilename}`);
        continue;
      }

      const filepath = path.join(processedDir, sanitizedFilename);

      if (!fs.existsSync(filepath)) {
        console.warn(`[BulkDownload] File not found: ${sanitizedFilename}`);
        continue;
      }

      // Security: Check for symlink attacks
      const stat = fs.lstatSync(filepath);
      if (stat.isSymbolicLink()) {
        console.error(`[BulkDownload] Symlink attack detected: ${sanitizedFilename}`);
        continue;
      }

      // Add file to zip
      const fileBuffer = fs.readFileSync(filepath);
      zip.file(sanitizedFilename, fileBuffer);
      addedFiles.push(sanitizedFilename);
    }

    if (addedFiles.length === 0) {
      return NextResponse.json(
        { error: 'No valid files found' },
        { status: 404 }
      );
    }

    // Generate the ZIP file
    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'STORE', // No compression for videos (already compressed)
      streamFiles: true,
    });

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const zipFilename = `timeback-videos-${timestamp}.zip`;

    return new NextResponse(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipFilename}"`,
        'Content-Length': zipBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Bulk download error:', error);
    return NextResponse.json(
      { error: 'Failed to create download package' },
      { status: 500 }
    );
  }
}
