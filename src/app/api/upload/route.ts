import { NextRequest, NextResponse } from 'next/server';
import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { auth } from '@clerk/nextjs/server';

// Route segment config for large file uploads (App Router)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes timeout for large uploads

export async function POST(request: NextRequest) {
  try {
    // Auth check first (route is public in middleware, but we require auth)
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get content type to determine how to parse
    const contentType = request.headers.get('content-type') || '';

    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        { error: 'Content type must be multipart/form-data' },
        { status: 400 }
      );
    }

    // Parse the multipart form data
    const formData = await request.formData();
    const file = formData.get('video') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // Validate file type
    const validTypes = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload MP4, MOV, WebM, or AVI.' },
        { status: 400 }
      );
    }

    // Create unique filename
    const fileId = uuidv4();
    const ext = path.extname(file.name) || '.mp4';
    const filename = `${fileId}${ext}`;

    // Ensure uploads directory exists
    const uploadsDir = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
    await mkdir(uploadsDir, { recursive: true });

    // Save file using streaming to handle large files
    const filepath = path.join(uploadsDir, filename);

    // Convert File to stream and pipe to file system
    const fileStream = file.stream();
    const writeStream = createWriteStream(filepath);

    // Use pipeline for proper stream handling
    await pipeline(
      Readable.fromWeb(fileStream as import('stream/web').ReadableStream),
      writeStream
    );

    return NextResponse.json({
      success: true,
      fileId,
      filename,
      originalName: file.name,
      size: file.size,
    });
  } catch (error) {
    console.error('Upload error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to upload file: ${errorMessage}` },
      { status: 500 }
    );
  }
}

