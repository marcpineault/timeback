import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { splitVideo } from '@/lib/ffmpeg';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { filename, splitPoints } = body;

    if (!filename || !splitPoints || !Array.isArray(splitPoints) || splitPoints.length === 0) {
      return NextResponse.json(
        { error: 'Missing filename or splitPoints' },
        { status: 400 }
      );
    }

    // Validate split points are numbers
    if (!splitPoints.every((p: unknown) => typeof p === 'number' && p > 0)) {
      return NextResponse.json(
        { error: 'Invalid split points' },
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

    // Generate base filename without extension
    const baseName = path.basename(filename, path.extname(filename));

    console.log(`[Split API] Splitting ${filename} at points: ${splitPoints.join(', ')}s`);

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
      { error: error instanceof Error ? error.message : 'Failed to split video' },
      { status: 500 }
    );
  }
}
