import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { trimVideo } from '@/lib/ffmpeg';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { filename, startTime, endTime } = body;

    if (!filename || startTime === undefined || endTime === undefined) {
      return NextResponse.json(
        { error: 'Missing filename, startTime, or endTime' },
        { status: 400 }
      );
    }

    if (startTime < 0 || endTime <= startTime) {
      return NextResponse.json(
        { error: 'Invalid trim times' },
        { status: 400 }
      );
    }

    const processedDir = process.env.PROCESSED_DIR || path.join(process.cwd(), 'processed');
    const inputPath = path.join(processedDir, filename);

    if (!fs.existsSync(inputPath)) {
      return NextResponse.json(
        { error: 'Video file not found' },
        { status: 404 }
      );
    }

    // Generate output filename with _trimmed suffix
    const baseName = path.basename(filename, path.extname(filename));
    const outputFilename = `${baseName}_trimmed.mp4`;
    const outputPath = path.join(processedDir, outputFilename);

    console.log(`[Trim API] Trimming ${filename} from ${startTime}s to ${endTime}s`);

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
      filename: filename,
      downloadUrl: `/api/download/${filename}`,
    });
  } catch (error) {
    console.error('Trim error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to trim video' },
      { status: 500 }
    );
  }
}
