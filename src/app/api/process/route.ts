import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { removeSilence, burnCaptions, addHeadline, insertBRollCutaways, ProcessingOptions, BRollCutaway, normalizeAudio, applyColorGrade, applyAutoZoom, ColorGradePreset, convertAspectRatio, AspectRatioPreset, applyCombinedFilters } from '@/lib/ffmpeg';
import { transcribeVideo, extractHook, identifyBRollMoments, TranscriptionWord } from '@/lib/whisper';
import { correctSpeechMistakes, SpeechCorrectionConfig, DEFAULT_SPEECH_CORRECTION_CONFIG } from '@/lib/speechCorrection';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { canProcessVideo, incrementVideoCount } from '@/lib/user';
import { cleanupOldFiles } from '@/lib/cleanup';
import { isS3Configured, getS3ObjectStream, deleteS3Object } from '@/lib/s3';
import { logger } from '@/lib/logger';
import { checkRateLimit, rateLimitResponse, getRateLimitIdentifier } from '@/lib/rateLimit';

export async function POST(request: NextRequest) {
  // Run cleanup of old files in background (non-blocking)
  setImmediate(() => cleanupOldFiles());

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
      speechCorrection,
      speechCorrectionConfig,
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

    // Rate limiting
    const rateLimitId = getRateLimitIdentifier(clerkUserId, request);
    const rateLimitResult = checkRateLimit(rateLimitId, 'process');
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult);
    }

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
    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.mkdir(processedDir, { recursive: true });

    let inputPath = path.join(uploadsDir, filename);
    let downloadedFromS3 = false;

    // Create video record with PENDING status immediately
    let videoRecordId: string | null = null;
    if (dbUserId) {
      const record = await prisma.video.create({
        data: {
          userId: dbUserId,
          originalName: filename,
          status: 'PENDING',
        },
      });
      videoRecordId = record.id;
      logger.info('Video record created', { videoId: videoRecordId, status: 'PENDING' });
    }

    // Helper to update video status
    const updateVideoStatus = async (status: 'PROCESSING' | 'COMPLETED' | 'FAILED', data?: { processedUrl?: string; errorMessage?: string }) => {
      if (videoRecordId) {
        await prisma.video.update({
          where: { id: videoRecordId },
          data: { status, ...data },
        });
        logger.info('Video status updated', { videoId: videoRecordId, status });
      }
    };

    logger.debug('Processing request received', { fileId, filename, s3Key: s3Key || 'NOT PROVIDED' });

    // If file is in S3, download it first
    if (s3Key && isS3Configured()) {
      logger.info('Downloading from Cloudflare R2', { s3Key });
      try {
        const s3Stream = await getS3ObjectStream(s3Key);
        const localPath = path.join(uploadsDir, filename);

        await pipeline(s3Stream, createWriteStream(localPath));

        inputPath = localPath;
        downloadedFromS3 = true;
        logger.info('File downloaded from S3 successfully');
      } catch (s3Error) {
        logger.error('Failed to download from S3', { error: String(s3Error) });
        await updateVideoStatus('FAILED', { errorMessage: 'Failed to download file from storage' });
        return NextResponse.json(
          { error: 'Failed to download file from storage' },
          { status: 500 }
        );
      }
    } else if (!downloadedFromS3) {
      logger.debug('Using local storage', { inputPath });
    }

    // Verify file exists (either local or downloaded from S3)
    if (!existsSync(inputPath)) {
      await updateVideoStatus('FAILED', { errorMessage: 'Video file not found' });
      return NextResponse.json(
        { error: 'Video file not found' },
        { status: 404 }
      );
    }

    // Update status to PROCESSING
    await updateVideoStatus('PROCESSING');

    const baseName = path.basename(inputPath, path.extname(inputPath));
    let currentInput = inputPath;
    let stepOutput: string;

    const options: ProcessingOptions = {
      silenceThreshold: silenceThreshold ?? -30,
      silenceDuration: silenceDuration ?? 0.4,
      headline: headline || undefined,
      headlinePosition: headlinePosition || 'top',
      captionStyle: captionStyle || 'instagram',
    };

    // Determine what features need transcription
    const needsTranscription = generateCaptions || useHookAsHeadline || generateBRoll || speechCorrection;
    const needsEarlyTranscription = useHookAsHeadline || generateBRoll; // These can use original video transcription

    // OPTIMIZATION: Run silence removal and early transcription in parallel
    // Hook extraction and B-roll identification don't need exact timestamps from silence-removed video
    let earlyTranscriptionPromise: Promise<{ text: string; segments: { start: number; end: number; text: string }[] }> | null = null;

    if (needsEarlyTranscription && !speechCorrection) {
      // Start transcribing original video in parallel (for hook/B-roll detection)
      logger.info('Starting parallel transcription of original video for hook/B-roll');
      earlyTranscriptionPromise = transcribeVideo(inputPath, processedDir, {
        animated: false, // Don't need word-level for hook/B-roll detection
        forSpeechCorrection: false,
      }).then(t => ({ text: t.text, segments: t.segments }));
    }

    // Step 1: Remove silence (runs in parallel with early transcription if applicable)
    logger.info('Step 1: Removing silence');
    stepOutput = path.join(processedDir, `${baseName}_nosilence.mp4`);
    await removeSilence(currentInput, stepOutput, options);
    // Clean up intermediate file
    if (currentInput !== inputPath) {
      await fs.unlink(currentInput).catch(() => {})
    }
    currentInput = stepOutput;

    // Step 1.5: Normalize audio levels if enabled
    if (shouldNormalizeAudio) {
      logger.info('Step 1.5: Normalizing audio levels');
      stepOutput = path.join(processedDir, `${baseName}_normalized.mp4`);
      await normalizeAudio(currentInput, stepOutput);
      // Clean up intermediate file
      if (currentInput !== inputPath) {
        await fs.unlink(currentInput).catch(() => {})
      }
      currentInput = stepOutput;
    }

    // Get early transcription result if we started one
    let earlyTranscription: { text: string; segments: { start: number; end: number; text: string }[] } | null = null;
    if (earlyTranscriptionPromise) {
      logger.info('Waiting for parallel transcription to complete');
      earlyTranscription = await earlyTranscriptionPromise;
      logger.info('Parallel transcription completed');
    }

    // Step 2: Transcribe the SILENCE-REMOVED video (only if needed for captions or speech correction)
    let srtPath: string | undefined;
    let hookText: string | undefined;
    let transcriptionSegments: { start: number; end: number; text: string }[] = [];
    let transcriptionWords: TranscriptionWord[] = [];

    if (needsTranscription) {
      // Use early transcription for hook extraction if available
      if (useHookAsHeadline && earlyTranscription) {
        hookText = extractHook(earlyTranscription.text);
        logger.info('Extracted hook from parallel transcription', { hookText });
      }

      // For B-roll, use early transcription segments if available
      if (generateBRoll && earlyTranscription && !generateCaptions && !speechCorrection) {
        transcriptionSegments = earlyTranscription.segments;
        logger.info('Using parallel transcription for B-roll', { segmentCount: transcriptionSegments.length });
      }

      // Only transcribe silence-removed video if we need accurate timestamps for captions or speech correction
      const needsSilenceRemovedTranscription = generateCaptions || speechCorrection ||
        (generateBRoll && !earlyTranscription); // Fallback if no early transcription

      if (needsSilenceRemovedTranscription) {
        logger.info('Step 2: Transcribing silence-removed video for captions/speech correction');
        // Use animated transcription (word-level timestamps) for animated caption style or speech correction
        // Use forSpeechCorrection to prompt Whisper to include filler words
        const transcription = await transcribeVideo(currentInput, processedDir, {
          animated: captionStyle === 'animated',
          forSpeechCorrection: speechCorrection,
        });
        srtPath = transcription.srtPath;
        transcriptionSegments = transcription.segments;
        transcriptionWords = transcription.words || [];

        // Extract hook if not already done from early transcription
        if (useHookAsHeadline && !hookText) {
          hookText = extractHook(transcription.text);
          logger.info('Extracted hook from silence-removed transcription', { hookText });
        }
      }

      if (speechCorrection) {
        logger.debug('Transcription for speech correction', { wordCount: transcriptionWords.length });
      }

      // Step 2.5: Apply AI Speech Correction if enabled
      if (speechCorrection && transcriptionWords.length > 0) {
        logger.info('Step 2.5: Applying AI speech correction');

        // Parse speech correction config
        const correctionConfig: SpeechCorrectionConfig = speechCorrectionConfig ? {
          removeFillerWords: speechCorrectionConfig.removeFillerWords ?? true,
          removeRepeatedWords: speechCorrectionConfig.removeRepeatedWords ?? true,
          removeFalseStarts: speechCorrectionConfig.removeFalseStarts ?? true,
          removeSelfCorrections: speechCorrectionConfig.removeSelfCorrections ?? true,
          aggressiveness: speechCorrectionConfig.aggressiveness || 'moderate',
        } : DEFAULT_SPEECH_CORRECTION_CONFIG;

        stepOutput = path.join(processedDir, `${baseName}_corrected.mp4`);
        const correctionResult = await correctSpeechMistakes(
          currentInput,
          stepOutput,
          transcriptionWords,
          correctionConfig
        );

        logger.info('Speech correction complete', { segmentsRemoved: correctionResult.segmentsRemoved, timeRemoved: correctionResult.timeRemoved.toFixed(2) });

        // Clean up intermediate file
        if (currentInput !== inputPath) {
          await fs.unlink(currentInput).catch(() => {})
        }
        currentInput = stepOutput;

        // Re-transcribe the corrected video if we need captions (since timestamps changed)
        if (generateCaptions && correctionResult.segmentsRemoved > 0) {
          logger.info('Re-transcribing after speech correction for accurate captions');
          const newTranscription = await transcribeVideo(currentInput, processedDir, { animated: captionStyle === 'animated' });
          srtPath = newTranscription.srtPath;
          transcriptionSegments = newTranscription.segments;
        }
      }

      // Step 3: Burn captions if enabled
      if (generateCaptions) {
        logger.info('Step 3: Burning captions');
        stepOutput = path.join(processedDir, `${baseName}_captioned.mp4`);
        await burnCaptions(currentInput, stepOutput, srtPath, options.captionStyle);
        // Clean up intermediate file
        if (currentInput !== inputPath) {
          await fs.unlink(currentInput).catch(() => {})
        }
        currentInput = stepOutput;
      }

      // Clean up SRT file
      if (srtPath && existsSync(srtPath)) {
        await fs.unlink(srtPath).catch(() => {});
      }
    }

    // Step 3.2: Apply color grading if selected
    // Use combined filter if both colorGrade and headline are enabled (saves one FFmpeg pass)
    const finalHeadline = useHookAsHeadline ? hookText : options.headline;
    const canUseCombinedFilters = (colorGrade && colorGrade !== 'none') && finalHeadline && !autoZoom;

    if (colorGrade && colorGrade !== 'none' && !canUseCombinedFilters) {
      logger.info('Step 3.2: Applying color grade', { colorGrade });
      stepOutput = path.join(processedDir, `${baseName}_graded.mp4`);
      await applyColorGrade(currentInput, stepOutput, colorGrade as ColorGradePreset);
      // Clean up intermediate file
      if (currentInput !== inputPath) {
        await fs.unlink(currentInput).catch(() => {})
      }
      currentInput = stepOutput;
    }

    // Step 3.5: Generate and insert AI B-Roll if enabled
    logger.debug('B-Roll check', { enabled: generateBRoll, segmentCount: transcriptionSegments.length });
    if (generateBRoll && transcriptionSegments.length > 0) {
      logger.info('Step 3.5: Generating AI B-Roll animations');

      // Identify key moments for B-roll
      const moments = await identifyBRollMoments(transcriptionSegments, 2);
      logger.info('Identified B-roll moments', { count: moments.length });

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
          await fs.unlink(currentInput).catch(() => {})
        }
        currentInput = stepOutput;
      }
    }

    // Step 3.8: Apply auto-zoom on speech if enabled
    if (autoZoom && transcriptionSegments.length > 0) {
      logger.info('Step 3.8: Applying auto-zoom on speech');
      const zoomIntensity = 1 + (autoZoomIntensity || 5) / 100; // Convert percentage to multiplier (e.g., 5% -> 1.05)
      stepOutput = path.join(processedDir, `${baseName}_zoomed.mp4`);
      await applyAutoZoom(currentInput, stepOutput, transcriptionSegments, zoomIntensity);
      // Clean up intermediate file
      if (currentInput !== inputPath) {
        await fs.unlink(currentInput).catch(() => {})
      }
      currentInput = stepOutput;
    }

    // Step 4: Add headline if provided or using hook
    // If combined filters are used, apply color grade + headline in one pass
    if (canUseCombinedFilters) {
      logger.info('Step 4: Applying combined filters (color grade + headline)');
      stepOutput = path.join(processedDir, `${baseName}_combined.mp4`);
      await applyCombinedFilters(currentInput, stepOutput, {
        colorGrade: colorGrade as ColorGradePreset,
        headline: finalHeadline,
        headlinePosition: options.headlinePosition,
        captionStyle,
      });
      // Clean up intermediate file
      if (currentInput !== inputPath) {
        await fs.unlink(currentInput).catch(() => {})
      }
      currentInput = stepOutput;
    } else if (finalHeadline) {
      logger.info('Step 4: Adding headline', { headline: finalHeadline });
      stepOutput = path.join(processedDir, `${baseName}_final.mp4`);
      await addHeadline(currentInput, stepOutput, finalHeadline, options.headlinePosition, captionStyle);
      // Clean up intermediate file
      if (currentInput !== inputPath) {
        await fs.unlink(currentInput).catch(() => {})
      }
      currentInput = stepOutput;
    }

    // Step 5: Convert aspect ratio if specified
    if (aspectRatio && aspectRatio !== 'original') {
      logger.info('Step 5: Converting aspect ratio', { aspectRatio });
      stepOutput = path.join(processedDir, `${baseName}_aspect.mp4`);
      await convertAspectRatio(currentInput, stepOutput, aspectRatio as AspectRatioPreset);
      // Clean up intermediate file
      if (currentInput !== inputPath) {
        await fs.unlink(currentInput).catch(() => {})
      }
      currentInput = stepOutput;
    }

    // Rename to final output
    const finalOutput = path.join(processedDir, `${baseName}_processed.mp4`);
    if (currentInput !== finalOutput) {
      await fs.rename(currentInput, finalOutput);
    }

    const outputFilename = path.basename(finalOutput);

    // Track usage and update video record if user is authenticated
    if (dbUserId) {
      await incrementVideoCount(dbUserId);

      // Update video record to COMPLETED with the processed URL
      await updateVideoStatus('COMPLETED', { processedUrl: `/api/download/${outputFilename}` });
    }

    // Clean up the original uploaded file
    try {
      if (existsSync(inputPath)) {
        await fs.unlink(inputPath);
        logger.debug('Cleaned up local upload file');
      }
    } catch (cleanupErr) {
      logger.warn('Failed to clean up local file', { error: String(cleanupErr) });
    }

    // Clean up S3 file if it was downloaded from there
    if (s3Key && downloadedFromS3 && isS3Configured()) {
      try {
        await deleteS3Object(s3Key);
        logger.debug('Cleaned up S3 file');
      } catch (s3CleanupErr) {
        logger.warn('Failed to clean up S3 file', { error: String(s3CleanupErr) });
      }
    }

    logger.info('Processing complete', { outputFilename });
    return NextResponse.json({
      success: true,
      outputFilename,
      downloadUrl: `/api/download/${outputFilename}`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Processing error', { error: errorMessage });

    // Update video status to FAILED if we have a video record
    // Need to access the videoRecord from the outer scope - it won't exist if error occurred before creation
    // So we use a different approach - check if there's a pending video for this user
    try {
      const { userId: clerkUserId } = await auth();
      if (clerkUserId) {
        const user = await prisma.user.findUnique({
          where: { clerkId: clerkUserId },
        });
        if (user) {
          // Find and update any PROCESSING videos for this user to FAILED
          await prisma.video.updateMany({
            where: {
              userId: user.id,
              status: { in: ['PENDING', 'PROCESSING'] },
            },
            data: {
              status: 'FAILED',
              errorMessage: errorMessage,
            },
          });
        }
      }
    } catch (dbError) {
      logger.error('Failed to update video status on error', { error: String(dbError) });
    }

    return NextResponse.json(
      { error: 'Failed to process video. Please try again.' },
      { status: 500 }
    );
  }
}
