import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { PassThrough } from 'stream';
import archiver from 'archiver';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { isS3Configured, getS3ObjectStream } from '@/lib/s3';

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

    // Collect valid files to add to archive
    const validFiles: { name: string; processedUrl: string }[] = [];
    const processedDir = process.env.PROCESSED_DIR || path.join(process.cwd(), 'processed');

    for (const filename of filenames) {
      // Sanitize filename to prevent directory traversal
      const sanitizedFilename = path.basename(filename);

      // Find video by looking for either local path or S3 key
      const expectedLocalUrl = `/api/download/${sanitizedFilename}`;
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
        console.warn(`[BulkDownload] Skipping unauthorized file: ${sanitizedFilename}`);
        continue;
      }

      const isS3Key = video.processedUrl.startsWith('processed/');

      // For local files, verify they exist
      if (!isS3Key) {
        const filepath = path.join(processedDir, sanitizedFilename);
        if (!fs.existsSync(filepath)) {
          console.warn(`[BulkDownload] Local file not found: ${sanitizedFilename}`);
          continue;
        }

        // Security: Check for symlink attacks
        const stat = fs.lstatSync(filepath);
        if (stat.isSymbolicLink()) {
          console.error(`[BulkDownload] Symlink attack detected: ${sanitizedFilename}`);
          continue;
        }
      }

      validFiles.push({ name: sanitizedFilename, processedUrl: video.processedUrl });
    }

    if (validFiles.length === 0) {
      return NextResponse.json(
        { error: 'No valid files found' },
        { status: 404 }
      );
    }

    // Create a PassThrough stream to pipe archiver output
    const passThrough = new PassThrough();

    // Create archive with no compression (videos are already compressed)
    const archive = archiver('zip', {
      store: true, // No compression
    });

    // Handle archive errors
    archive.on('error', (err) => {
      console.error('[BulkDownload] Archive error:', err);
      passThrough.destroy(err);
    });

    // Pipe archive to passThrough
    archive.pipe(passThrough);

    // Add files to archive asynchronously
    const addFilesPromise = (async () => {
      for (const file of validFiles) {
        const isS3Key = file.processedUrl.startsWith('processed/');

        if (isS3Key && isS3Configured()) {
          // Stream from S3/R2
          console.log(`[BulkDownload] Adding S3 file: ${file.name}`);
          try {
            const s3Stream = await getS3ObjectStream(file.processedUrl);
            archive.append(s3Stream, { name: file.name });
          } catch (err) {
            console.error(`[BulkDownload] Failed to get S3 stream for ${file.name}:`, err);
          }
        } else {
          // Stream from local filesystem
          const filepath = path.join(processedDir, file.name);
          console.log(`[BulkDownload] Adding local file: ${file.name}`);
          archive.file(filepath, { name: file.name });
        }
      }

      // Finalize the archive
      await archive.finalize();
    })();

    // Handle the async file adding in background
    addFilesPromise.catch((err) => {
      console.error('[BulkDownload] Error adding files to archive:', err);
      passThrough.destroy(err);
    });

    // Convert Node stream to Web ReadableStream
    const webStream = new ReadableStream({
      start(controller) {
        passThrough.on('data', (chunk) => {
          try {
            controller.enqueue(chunk);
          } catch {
            // Controller closed (client disconnected)
            archive.abort();
            passThrough.destroy();
          }
        });
        passThrough.on('end', () => {
          try {
            controller.close();
          } catch {
            // Controller already closed
          }
        });
        passThrough.on('error', (err) => {
          console.error('[BulkDownload] Stream error:', err);
          try {
            controller.error(err);
          } catch {
            // Controller already closed
          }
        });
      },
      cancel() {
        // Client disconnected, clean up
        archive.abort();
        passThrough.destroy();
      },
    });

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const zipFilename = `timeback-videos-${timestamp}.zip`;

    return new NextResponse(webStream, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipFilename}"`,
        // Note: Cannot set Content-Length with streaming
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
