import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;

    // Sanitize filename to prevent directory traversal
    const sanitizedFilename = path.basename(filename);
    const processedDir = process.env.PROCESSED_DIR || path.join(process.cwd(), 'processed');
    const filepath = path.join(processedDir, sanitizedFilename);

    if (!fs.existsSync(filepath)) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    const fileBuffer = fs.readFileSync(filepath);
    const stat = fs.statSync(filepath);

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
