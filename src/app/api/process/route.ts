import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { removeSilence, burnCaptions, addHeadline, insertBRollCutaways, ProcessingOptions, BRollCutaway, normalizeAudio, applyColorGrade, applyAutoZoom, ColorGradePreset, convertAspectRatio, AspectRatioPreset } from '@/lib/ffmpeg';
import { transcribeVideo, extractHook, identifyBRollMoments } from '@/lib/whisper';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { canProcessVideo, incrementVideoCount } from '@/lib/user';
import { cleanupOldFiles } from '@/lib/cleanup';
import { isS3Configured, getS3ObjectStream, deleteS3Object } from '@/lib/s3';

export async function POST(request: NextRequest) {
  // Run cleanup of old files on each request
  cleanupOldFiles();

  try {
    const body = await request.json();
    const {
      fileId,
      filename,
      s3Key,  // S3 key if file was uploaded to S3
      headline,
      headlinePosition,
      captionStyle,
      silenceThreshold,
      silenceDuration,
      generateCaptions,
      useHookAsHeadline,
      generateBRoll,
      normalizeAudio: shouldNormalizeAudio,
      colorGrade,
      autoZoom,
      autoZoomIntensity,
      aspectRatio,
      userId: bodyUserId,
    } = body;

    if (!fileId || !filename) {
      return NextResponse.json(
        { error: 'Missing fileId or filename' },
        { status: 400 }
      );
    }

    // Check authentication and usage limits
    const { userId: clerkUserId } = await auth();
    let dbUserId = bodyUserId;

    if (clerkUserId) {
      const user = await prisma.user.findUnique({
        where: { clerkId: clerkUserId },
      });

      if (user) {
        dbUserId = user.id;
        const canProcess = await canProcessVideo(user.id);

        if (!canProcess.allowed) {
          return NextResponse.json(
            { error: canProcess.reason },
            { status: 403 }
          );
        }
      }
    }

    // Use env vars if set (for Railway volume mount), otherwise use defaults
    const uploadsDir = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
    const processedDir = process.env.PROCESSED_DIR || path.join(process.cwd(), 'processed');

    // Ensure directories exist
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.mkdirSync(processedDir, { recursive: true });

    let inputPath = path.join(uploadsDir, filename);
    let downloadedFromS3 = false;

    // Debug logging
    console.log('[Process] Received request:');
    console.log('[Process] - fileId:', fileId);
    console.log('[Process] - filename:', filename);
    console.log('[Process] - s3Key:', s3Key || 'NOT PROVIDED');

    // If file is in S3, download it first
    if (s3Key && isS3Configured()) {
      console.log('[Process] ========================================');
      console.log('[Process] STORAGE: CLOUDFLARE R2');
      console.log('[Process] S3 Key:', s3Key);
      console.log('[Process] Downloading file from R2...');
      try {
        const s3Stream = await getS3ObjectStream(s3Key);
        const localPath = path.join(uploadsDir, filename);

        await pipeline(s3Stream, createWriteStream(localPath));

        inputPath = localPath;
        downloadedFromS3 = true;
        console.log('[Process] File downloaded from S3 successfully');
      } catch (s3Error) {
        console.error('[Process] Failed to download from S3:', s3Error);
        return NextResponse.json(
          { error: 'Failed to download file from storage' },
          { status: 500 }
        );
      }
    }

    // Log storage method if NOT using S3
    if (!downloadedFromS3) {
      console.log('[Process] ========================================');
      console.log('[Process] STORAGE: LOCAL (Railway filesystem)');
      console.log('[Process] File path:', inputPath);
    }

    // Verify file exists (either local or downloaded from S3)
    if (!fs.existsSync(inputPath)) {
      return NextResponse.json(
        { error: 'Video file not found' },
        { status: 404 }
      );
    }

    const baseName = path.basename(inputPath, path.extname(inputPath));
    let currentInput = inputPath;
    let stepOutput: string;

    const options: ProcessingOptions = {
      silenceThreshold: silenceThreshold ?? -30,
      silenceDuration: silenceDuration ?? 0.4,
      headline: headline || undefined,
      headlinePosition: headlinePosition || 'top',
      captionStyle: captionStyle || 'default',
    };

    // Step 1: Remove silence FIRST
    console.log('[Process] Step 1: Removing silence...');
    stepOutput = path.join(processedDir, `${baseName}_nosilence.mp4`);
    await removeSilence(currentInput, stepOutput, options);
    // Clean up intermediate file
    if (currentInput !== inputPath) {
      try { fs.unlinkSync(currentInput); } catch {}
    }
    currentInput = stepOutput;

    // Step 1.5: Normalize audio levels if enabled
    if (shouldNormalizeAudio) {
      console.log('[Process] Step 1.5: Normalizing audio levels...');
      stepOutput = path.join(processedDir, `${baseName}_normalized.mp4`);
      await normalizeAudio(currentInput, stepOutput);
      // Clean up intermediate file
      if (currentInput !== inputPath) {
        try { fs.unlinkSync(currentInput); } catch {}
      }
      currentInput = stepOutput;
    }

    // Step 2: Transcribe the SILENCE-REMOVED video (so timestamps match!)
    let srtPath: string | undefined;
    let hookText: string | undefined;
    let transcriptionSegments: { start: number; end: number; text: string }[] = [];

    if (generateCaptions || useHookAsHeadline || generateBRoll) {
      console.log('[Process] Step 2: Transcribing silence-removed video...');
      // Use animated transcription (word-level timestamps) for animated caption style
      const isAnimated = captionStyle === 'animated';
      const transcription = await transcribeVideo(currentInput, processedDir, { animated: isAnimated });
      srtPath = transcription.srtPath;
      transcriptionSegments = transcription.segments;

      // Extract hook if needed
      if (useHookAsHeadline) {
        hookText = extractHook(transcription.text);
        console.log(`[Process] Extracted hook: "${hookText}"`);
      }

      // Step 3: Burn captions if enabled
      if (generateCaptions) {
        console.log('[Process] Step 3: Burning captions...');
        stepOutput = path.join(processedDir, `${baseName}_captioned.mp4`);
        await burnCaptions(currentInput, stepOutput, srtPath, options.captionStyle);
        // Clean up intermediate file
        if (currentInput !== inputPath) {
          try { fs.unlinkSync(currentInput); } catch {}
        }
        currentInput = stepOutput;
      }

      // Clean up SRT file
      if (srtPath && fs.existsSync(srtPath)) {
        fs.unlinkSync(srtPath);
      }
    }

    // Step 3.2: Apply color grading if selected
    if (colorGrade && colorGrade !== 'none') {
      console.log(`[Process] Step 3.2: Applying ${colorGrade} color grade...`);
      stepOutput = path.join(processedDir, `${baseName}_graded.mp4`);
      await applyColorGrade(currentInput, stepOutput, colorGrade as ColorGradePreset);
      // Clean up intermediate file
      if (currentInput !== inputPath) {
        try { fs.unlinkSync(currentInput); } catch {}
      }
      currentInput = stepOutput;
    }

    // Step 3.5: Generate and insert AI B-Roll if enabled
    console.log(`[Process] B-Roll enabled: ${generateBRoll}, segments: ${transcriptionSegments.length}`);
    if (generateBRoll && transcriptionSegments.length > 0) {
      console.log('[Process] Step 3.5: Generating AI B-Roll animations...');

      // Identify key moments for B-roll
      const moments = await identifyBRollMoments(transcriptionSegments, 2);
      console.log(`[Process] Identified ${moments.length} B-roll moments`);

      if (moments.length > 0) {
        // Create cutaways from identified moments - pass context for animation generation
        const cutaways: BRollCutaway[] = moments.map(moment => ({
          timestamp: moment.timestamp,
          duration: moment.duration,
          context: moment.context, // Pass context for contextual animation
        }));

        // Insert animated cutaways into video
        stepOutput = path.join(processedDir, `${baseName}_broll.mp4`);
        await insertBRollCutaways(currentInput, stepOutput, cutaways, processedDir);

        // Clean up intermediate file
        if (currentInput !== inputPath) {
          try { fs.unlinkSync(currentInput); } catch {}
        }
        currentInput = stepOutput;
      }
    }

    // Step 3.8: Apply auto-zoom on speech if enabled
    if (autoZoom && transcriptionSegments.length > 0) {
      console.log(`[Process] Step 3.8: Applying auto-zoom on speech...`);
      const zoomIntensity = 1 + (autoZoomIntensity || 5) / 100; // Convert percentage to multiplier (e.g., 5% -> 1.05)
      stepOutput = path.join(processedDir, `${baseName}_zoomed.mp4`);
      await applyAutoZoom(currentInput, stepOutput, transcriptionSegments, zoomIntensity);
      // Clean up intermediate file
      if (currentInput !== inputPath) {
        try { fs.unlinkSync(currentInput); } catch {}
      }
      currentInput = stepOutput;
    }

    // Step 4: Add headline if provided or using hook
    const finalHeadline = useHookAsHeadline ? hookText : options.headline;
    if (finalHeadline) {
      console.log(`[Process] Step 4: Adding headline: "${finalHeadline}"`);
      stepOutput = path.join(processedDir, `${baseName}_final.mp4`);
      await addHeadline(currentInput, stepOutput, finalHeadline, options.headlinePosition);
      // Clean up intermediate file
      if (currentInput !== inputPath) {
        try { fs.unlinkSync(currentInput); } catch {}
      }
      currentInput = stepOutput;
    }

    // Step 5: Convert aspect ratio if specified
    if (aspectRatio && aspectRatio !== 'original') {
      console.log(`[Process] Step 5: Converting aspect ratio to ${aspectRatio}...`);
      stepOutput = path.join(processedDir, `${baseName}_aspect.mp4`);
      await convertAspectRatio(currentInput, stepOutput, aspectRatio as AspectRatioPreset);
      // Clean up intermediate file
      if (currentInput !== inputPath) {
        try { fs.unlinkSync(currentInput); } catch {}
      }
      currentInput = stepOutput;
    }

    // Rename to final output
    const finalOutput = path.join(processedDir, `${baseName}_processed.mp4`);
    if (currentInput !== finalOutput) {
      fs.renameSync(currentInput, finalOutput);
    }

    const outputFilename = path.basename(finalOutput);

    // Track usage if user is authenticated
    if (dbUserId) {
      await incrementVideoCount(dbUserId);

      // Create video record
      await prisma.video.create({
        data: {
          userId: dbUserId,
          originalName: filename,
          processedUrl: `/api/download/${outputFilename}`,
          status: 'COMPLETED',
        },
      });
    }

    // Clean up the original uploaded file
    try {
      if (fs.existsSync(inputPath)) {
        fs.unlinkSync(inputPath);
        console.log('[Process] Cleaned up local upload file');
      }
    } catch (cleanupErr) {
      console.error('[Process] Failed to clean up local file:', cleanupErr);
    }

    // Clean up S3 file if it was downloaded from there
    if (s3Key && downloadedFromS3 && isS3Configured()) {
      try {
        await deleteS3Object(s3Key);
        console.log('[Process] Cleaned up S3 file');
      } catch (s3CleanupErr) {
        console.error('[Process] Failed to clean up S3 file:', s3CleanupErr);
      }
    }

    console.log('[Process] Complete!');
    return NextResponse.json({
      success: true,
      outputFilename,
      downloadUrl: `/api/download/${outputFilename}`,
    });
  } catch (error) {
    console.error('Processing error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process video' },
      { status: 500 }
    );
  }
}
