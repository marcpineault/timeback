import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, lstatSync } from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';

// Allow up to 3 minutes for removing sections from videos
export const maxDuration = 180;

interface Section {
  start: number;
  end: number;
}

/**
 * Remove specified sections from a video, keeping everything else
 * This is the inverse of trim - instead of keeping a section, you mark sections to remove
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { filename, sectionsToRemove } = body;

    if (!filename || !sectionsToRemove || !Array.isArray(sectionsToRemove)) {
      return NextResponse.json(
        { error: 'Missing filename or sectionsToRemove array' },
        { status: 400 }
      );
    }

    // Validate sections array
    if (sectionsToRemove.length === 0) {
      return NextResponse.json(
        { error: 'No sections specified to remove' },
        { status: 400 }
      );
    }

    if (sectionsToRemove.length > 50) {
      return NextResponse.json(
        { error: 'Maximum 50 sections allowed' },
        { status: 400 }
      );
    }

    // Validate each section
    for (const section of sectionsToRemove) {
      if (typeof section.start !== 'number' || typeof section.end !== 'number') {
        return NextResponse.json(
          { error: 'Each section must have start and end as numbers' },
          { status: 400 }
        );
      }
      if (!Number.isFinite(section.start) || !Number.isFinite(section.end)) {
        return NextResponse.json(
          { error: 'Section times must be finite numbers' },
          { status: 400 }
        );
      }
      if (section.start < 0 || section.end < 0) {
        return NextResponse.json(
          { error: 'Section times cannot be negative' },
          { status: 400 }
        );
      }
      if (section.start >= section.end) {
        return NextResponse.json(
          { error: 'Section start must be less than end' },
          { status: 400 }
        );
      }
    }

    // Check authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Sanitize filename - prevent path traversal
    const sanitizedFilename = path.basename(filename);
    if (sanitizedFilename !== filename || filename.includes('..')) {
      return NextResponse.json(
        { error: 'Invalid filename' },
        { status: 400 }
      );
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Verify user owns this video
    const video = await prisma.video.findFirst({
      where: {
        userId: user.id,
        OR: [
          { originalName: sanitizedFilename },
          { processedUrl: { contains: sanitizedFilename } },
        ],
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

    // Check if file exists
    if (!existsSync(inputPath)) {
      return NextResponse.json(
        { error: 'Video file not found' },
        { status: 404 }
      );
    }

    // Security: Check for symlink attacks
    const stat = lstatSync(inputPath);
    if (stat.isSymbolicLink()) {
      return NextResponse.json(
        { error: 'Invalid file' },
        { status: 400 }
      );
    }

    // Get video duration
    const duration = await new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err, metadata) => {
        if (err) return reject(err);
        resolve(metadata.format.duration || 0);
      });
    });

    // Sort sections by start time and merge overlapping
    const sortedSections = [...sectionsToRemove].sort((a, b) => a.start - b.start);
    const mergedSections: Section[] = [];

    for (const section of sortedSections) {
      // Clamp to video duration
      const clampedSection = {
        start: Math.max(0, section.start),
        end: Math.min(duration, section.end),
      };

      if (mergedSections.length === 0) {
        mergedSections.push(clampedSection);
      } else {
        const last = mergedSections[mergedSections.length - 1];
        // Merge if overlapping or adjacent (within 0.1s)
        if (clampedSection.start <= last.end + 0.1) {
          last.end = Math.max(last.end, clampedSection.end);
        } else {
          mergedSections.push(clampedSection);
        }
      }
    }

    // Calculate segments to KEEP (inverse of sections to remove)
    const segmentsToKeep: Section[] = [];
    let lastEnd = 0;

    for (const section of mergedSections) {
      if (section.start > lastEnd) {
        segmentsToKeep.push({ start: lastEnd, end: section.start });
      }
      lastEnd = section.end;
    }

    // Add final segment if there's content after the last removed section
    if (lastEnd < duration) {
      segmentsToKeep.push({ start: lastEnd, end: duration });
    }

    // Filter out very short segments (less than 100ms)
    const validSegments = segmentsToKeep.filter(seg => (seg.end - seg.start) >= 0.1);

    if (validSegments.length === 0) {
      return NextResponse.json(
        { error: 'Cannot remove all content from video' },
        { status: 400 }
      );
    }

    console.log(`[Remove Sections] Keeping ${validSegments.length} segments, removing ${mergedSections.length} sections`);
    console.log('[Remove Sections] Segments to keep:', validSegments);

    // Generate output filename
    const baseName = path.basename(sanitizedFilename, path.extname(sanitizedFilename));
    const outputFilename = `${baseName}_edited${path.extname(sanitizedFilename)}`;
    const outputPath = path.join(processedDir, outputFilename);

    // If only one segment and it covers the whole video, no changes needed
    if (validSegments.length === 1 &&
        validSegments[0].start < 0.1 &&
        Math.abs(validSegments[0].end - duration) < 0.1) {
      return NextResponse.json({
        success: true,
        message: 'No changes made - sections to remove are outside video',
        filename: sanitizedFilename,
        downloadUrl: `/api/download/${sanitizedFilename}`,
      });
    }

    // Build FFmpeg filter complex to concatenate kept segments
    const filterParts: string[] = [];
    const concatInputs: string[] = [];

    validSegments.forEach((segment, index) => {
      filterParts.push(
        `[0:v]trim=start=${segment.start}:end=${segment.end},setpts=PTS-STARTPTS[v${index}]`
      );
      filterParts.push(
        `[0:a]atrim=start=${segment.start}:end=${segment.end},asetpts=PTS-STARTPTS[a${index}]`
      );
      concatInputs.push(`[v${index}][a${index}]`);
    });

    const filterComplex = [
      ...filterParts,
      `${concatInputs.join('')}concat=n=${validSegments.length}:v=1:a=1[outv][outa]`,
    ].join(';');

    // Process video
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .complexFilter(filterComplex)
        .outputOptions([
          '-map', '[outv]',
          '-map', '[outa]',
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23',
          '-c:a', 'aac',
          '-b:a', '128k',
        ])
        .output(outputPath)
        .on('end', () => {
          console.log('[Remove Sections] Processing complete');
          resolve();
        })
        .on('error', (err) => {
          console.error('[Remove Sections] FFmpeg error:', err);
          reject(err);
        })
        .run();
    });

    // Replace original file with edited version
    await fs.unlink(inputPath);
    await fs.rename(outputPath, inputPath);

    // Calculate stats
    const totalRemoved = mergedSections.reduce((sum, s) => sum + (s.end - s.start), 0);
    const newDuration = duration - totalRemoved;

    return NextResponse.json({
      success: true,
      filename: sanitizedFilename,
      downloadUrl: `/api/download/${sanitizedFilename}`,
      stats: {
        originalDuration: duration,
        newDuration,
        sectionsRemoved: mergedSections.length,
        timeRemoved: totalRemoved,
      },
    });
  } catch (error) {
    console.error('Remove sections error:', error);
    return NextResponse.json(
      { error: 'Failed to remove sections from video' },
      { status: 500 }
    );
  }
}
