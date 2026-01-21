import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Route segment config for large file uploads (App Router)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60 seconds timeout for Vercel/Railway

export async function POST(request: NextRequest) {
  try {
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
    const uploadsDir = path.join(process.cwd(), 'uploads');
    await mkdir(uploadsDir, { recursive: true });

    // Save file
    const filepath = path.join(uploadsDir, filename);
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filepath, buffer);

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

