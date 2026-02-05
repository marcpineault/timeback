import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { removeSilence, burnCaptions, addHeadline, insertBRollCutaways, ProcessingOptions, BRollCutaway, normalizeAudio, convertAspectRatio, AspectRatioPreset, applyCombinedFilters } from '@/lib/ffmpeg';
import { transcribeVideo, extractHook, identifyBRollMoments, TranscriptionWord, generateAIHeadline } from '@/lib/whisper';
import { correctSpeechMistakes, SpeechCorrectionConfig, DEFAULT_SPEECH_CORRECTION_CONFIG } from '@/lib/speechCorrection';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { canProcessVideo, incrementVideoCount } from '@/lib/user';
import { cleanupOldFiles } from '@/lib/cleanup';
import { isS3Configured, getS3ObjectStream, deleteS3Object, uploadProcessedVideo } from '@/lib/s3';
import { logger } from '@/lib/logger';
import { checkRateLimit, rateLimitResponse, getRateLimitIdentifier } from '@/lib/rateLimit';
import { acquireFileLock, releaseFileLock } from '@/lib/fileLock';

// Allow up to 10 minutes for video processing (transcription, silence removal, etc.)
export const maxDuration = 600;

export async function POST(request: NextRequest) {
  // Run cleanup of old files in background (non-blocking)
  setImmediate(() => cleanupOldFiles());

  // Track locked file path for cleanup in error handler
  let lockedFilePath: string | null = null;
  // Track video record ID for per-video error handling
  let videoRecordId: string | null = null;
  // Track intermediate files for cleanup on error
  const intermediateFiles: string[] = [];
  // Track input file path for cleanup
  let inputFilePath: string | null = null;

  try {
    const body = await request.json();
    const {
      fileId,
      filename,
      originalName,  // Original filename for display in dashboard
      s3Key,  // S3 key if file was uploaded to S3
      headline,
      headlinePosition,
      headlineStyle,
      captionStyle,
      silenceThreshold,
      silenceDuration,
      autoSilenceThreshold,
      generateCaptions,
      useHookAsHeadline,
      generateAIHeadline: shouldGenerateAIHeadline,
      generateBRoll,
      bRollConfig,
      normalizeAudio: shouldNormalizeAudio,
      aspectRatio,
      speechCorrection,
      speechCorrectionConfig,
      userId: bodyUserId,
      videoId: existingVideoId,  // Optional: for reprocessing existing videos
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

        // Allow reprocessing even if at limit (check existingVideoId ownership)
        const isReprocessAttempt = existingVideoId && await prisma.video.findFirst({
          where: { id: existingVideoId, userId: user.id },
        });

        if (!isReprocessAttempt) {
          const canProcess = await canProcessVideo(user.id);

          if (!canProcess.allowed) {
            return NextResponse.json(
              { error: canProcess.reason },
              { status: 403 }
            );
          }
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

    // Create or reuse video record
    let isReprocess = false;  // Track if this is a reprocess (don't count against limit)

    if (dbUserId) {
      if (existingVideoId) {
        // Reprocessing an existing video - verify ownership and reuse record
        const existingVideo = await prisma.video.findFirst({
          where: { id: existingVideoId, userId: dbUserId },
        });

        if (existingVideo) {
          videoRecordId = existingVideo.id;
          isReprocess = true;
          // Reset status to PENDING for reprocessing
          await prisma.video.update({
            where: { id: existingVideoId },
            data: { status: 'PENDING', errorMessage: null, processedUrl: null },
          });
          logger.info('Reprocessing existing video', { videoId: videoRecordId });
        } else {
          logger.warn('Video not found or not owned by user', { videoId: existingVideoId });
        }
      }

      // Create new record if not reprocessing
      if (!videoRecordId) {
        const record = await prisma.video.create({
          data: {
            userId: dbUserId,
            originalName: originalName || filename, // Use original name if available, fallback to UUID filename
            status: 'PENDING',
          },
        });
        videoRecordId = record.id;
        logger.info('Video record created', { videoId: videoRecordId, status: 'PENDING' });
      }
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

    // Atomic helper to claim video for processing (idempotency check)
    // Returns true if successfully claimed, false if already being processed
    const claimVideoForProcessing = async (): Promise<boolean> => {
      if (!videoRecordId) return true; // No video record to claim

      try {
        // Use atomic update with condition - only update if status is PENDING
        const result = await prisma.video.updateMany({
          where: {
            id: videoRecordId,
            status: 'PENDING',
          },
          data: {
            status: 'PROCESSING',
          },
        });

        if (result.count === 0) {
          // No rows updated means video was not in PENDING state
          const video = await prisma.video.findUnique({
            where: { id: videoRecordId },
            select: { status: true },
          });
          logger.warn('Failed to claim video for processing - already in progress or completed', {
            videoId: videoRecordId,
            currentStatus: video?.status,
          });
          return false;
        }

        logger.info('Successfully claimed video for processing', { videoId: videoRecordId });
        return true;
      } catch (error) {
        logger.error('Error claiming video for processing', { videoId: videoRecordId, error: String(error) });
        return false;
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

    // Acquire file lock to prevent cleanup during processing
    acquireFileLock(inputPath, undefined, videoRecordId || undefined);
    lockedFilePath = inputPath;
    inputFilePath = inputPath; // Track for cleanup on error
    logger.debug('Acquired file lock for processing', { inputPath });

    // Atomically claim video for processing (idempotency check)
    // This prevents duplicate processing from multiple tabs or retried requests
    const claimed = await claimVideoForProcessing();
    if (!claimed) {
      // Release the lock since we're not processing
      if (lockedFilePath) {
        releaseFileLock(lockedFilePath);
        lockedFilePath = null;
      }
      return NextResponse.json(
        { error: 'Video is already being processed', code: 'ALREADY_PROCESSING' },
        { status: 409 }
      );
    }

    const baseName = path.basename(inputPath, path.extname(inputPath));
    let currentInput = inputPath;
    let stepOutput: string;

    const options: ProcessingOptions = {
      silenceThreshold: silenceThreshold ?? -25,
      silenceDuration: silenceDuration ?? 0.4,
      autoSilenceThreshold: autoSilenceThreshold ?? false,
      headline: headline || undefined,
      headlinePosition: headlinePosition || 'top',
      headlineStyle: headlineStyle || 'speech-bubble',
      captionStyle: captionStyle || 'instagram',
    };

    // Determine what features need transcription
    const needsTranscription = generateCaptions || useHookAsHeadline || shouldGenerateAIHeadline || generateBRoll || speechCorrection;
    const needsEarlyTranscription = useHookAsHeadline || shouldGenerateAIHeadline || generateBRoll; // These can use original video transcription

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
    intermediateFiles.push(stepOutput); // Track for cleanup on error
    await removeSilence(currentInput, stepOutput, options);
    // Clean up intermediate file (and remove from tracking since it's deleted)
    if (currentInput !== inputPath) {
      await fs.unlink(currentInput).catch(() => {});
      const idx = intermediateFiles.indexOf(currentInput);
      if (idx > -1) intermediateFiles.splice(idx, 1);
    }
    currentInput = stepOutput;

    // Step 1.5: Normalize audio levels if enabled
    if (shouldNormalizeAudio) {
      logger.info('Step 1.5: Normalizing audio levels');
      stepOutput = path.join(processedDir, `${baseName}_normalized.mp4`);
      intermediateFiles.push(stepOutput); // Track for cleanup on error
      await normalizeAudio(currentInput, stepOutput);
      // Clean up intermediate file (and remove from tracking)
      if (currentInput !== inputPath) {
        await fs.unlink(currentInput).catch(() => {});
        const idx = intermediateFiles.indexOf(currentInput);
        if (idx > -1) intermediateFiles.splice(idx, 1);
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
    let aiHeadlineText: string | undefined;
    let transcriptionSegments: { start: number; end: number; text: string }[] = [];
    let transcriptionWords: TranscriptionWord[] = [];

    if (needsTranscription) {
      // Use early transcription for hook extraction if available
      // Always extract hook for filename, even if not displaying it
      if (earlyTranscription) {
        hookText = extractHook(earlyTranscription.text);
        logger.info('Extracted hook from parallel transcription', { hookText });
      }

      // Generate AI headline from early transcription if available
      if (shouldGenerateAIHeadline && earlyTranscription) {
        logger.info('Generating AI headline from parallel transcription');
        try {
          const aiResult = await generateAIHeadline(earlyTranscription.segments);
          aiHeadlineText = aiResult.headline;
          logger.info('AI headline generated', { headline: aiHeadlineText, confidence: aiResult.confidence });
        } catch (aiError) {
          logger.error('AI headline generation failed, falling back to hook extraction', { error: String(aiError) });
          aiHeadlineText = extractHook(earlyTranscription.text);
        }
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
        // Always extract hook for filename, even if not displaying it
        if (!hookText) {
          hookText = extractHook(transcription.text);
          logger.info('Extracted hook from silence-removed transcription', { hookText });
        }

        // Generate AI headline if not already done from early transcription
        if (shouldGenerateAIHeadline && !aiHeadlineText) {
          logger.info('Generating AI headline from silence-removed transcription');
          try {
            const aiResult = await generateAIHeadline(transcriptionSegments);
            aiHeadlineText = aiResult.headline;
            logger.info('AI headline generated', { headline: aiHeadlineText, confidence: aiResult.confidence });
          } catch (aiError) {
            logger.error('AI headline generation failed, falling back to hook extraction', { error: String(aiError) });
            aiHeadlineText = extractHook(transcription.text);
          }
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
          removeRepeatedPhrases: speechCorrectionConfig.removeRepeatedPhrases ?? true,
          removeFalseStarts: speechCorrectionConfig.removeFalseStarts ?? true,
          removeSelfCorrections: speechCorrectionConfig.removeSelfCorrections ?? true,
          aggressiveness: speechCorrectionConfig.aggressiveness || 'moderate',
        } : DEFAULT_SPEECH_CORRECTION_CONFIG;

        stepOutput = path.join(processedDir, `${baseName}_corrected.mp4`);
        intermediateFiles.push(stepOutput); // Track for cleanup on error

        try {
          const correctionResult = await correctSpeechMistakes(
            currentInput,
            stepOutput,
            transcriptionWords,
            correctionConfig
          );

          logger.info('Speech correction complete', { segmentsRemoved: correctionResult.segmentsRemoved, timeRemoved: correctionResult.timeRemoved.toFixed(2) });

          // Clean up intermediate file (and remove from tracking)
          if (currentInput !== inputPath) {
            await fs.unlink(currentInput).catch(() => {});
            const idx = intermediateFiles.indexOf(currentInput);
            if (idx > -1) intermediateFiles.splice(idx, 1);
          }
          currentInput = stepOutput;

          // Re-transcribe the corrected video if we need captions (since timestamps changed)
          if (generateCaptions && correctionResult.segmentsRemoved > 0) {
            logger.info('Re-transcribing after speech correction for accurate captions');
            try {
              const newTranscription = await transcribeVideo(currentInput, processedDir, { animated: captionStyle === 'animated' });
              srtPath = newTranscription.srtPath;
              transcriptionSegments = newTranscription.segments;
            } catch (reTranscribeError) {
              // Re-transcription failed - disable captions to avoid misaligned timestamps
              logger.error('Re-transcription after speech correction failed, disabling captions', {
                error: String(reTranscribeError),
              });
              srtPath = undefined; // Clear the old SRT path to prevent misaligned captions
              // Continue processing without captions rather than failing entirely
            }
          }
        } catch (speechCorrectionError) {
          // Speech correction failed - log and continue without it
          logger.error('Speech correction failed, continuing without', {
            error: String(speechCorrectionError),
          });
          // Don't update currentInput - keep using the previous step's output
        }
      }

      // Step 3: Burn captions if enabled
      if (generateCaptions && srtPath) {
        logger.info('Step 3: Burning captions');
        stepOutput = path.join(processedDir, `${baseName}_captioned.mp4`);
        intermediateFiles.push(stepOutput); // Track for cleanup on error
        await burnCaptions(currentInput, stepOutput, srtPath, options.captionStyle);
        // Clean up intermediate file (and remove from tracking)
        if (currentInput !== inputPath) {
          await fs.unlink(currentInput).catch(() => {});
          const idx = intermediateFiles.indexOf(currentInput);
          if (idx > -1) intermediateFiles.splice(idx, 1);
        }
        currentInput = stepOutput;
      }

      // Clean up SRT file
      if (srtPath && existsSync(srtPath)) {
        await fs.unlink(srtPath).catch(() => {});
      }
    }

    // Priority: AI headline > Hook from video > Manual headline
    const finalHeadline = shouldGenerateAIHeadline ? aiHeadlineText : (useHookAsHeadline ? hookText : options.headline);

    // Step 3.5: AI B-Roll - TEMPORARILY DISABLED
    // TODO: Re-enable once animation generation is stable
    // The B-roll feature is disabled while we improve the animation quality
    /*
    const bRollStyle = bRollConfig?.style || 'dynamic';
    const bRollMaxMoments = bRollConfig?.maxMoments || 3;

    logger.debug('B-Roll check', { enabled: generateBRoll, segmentCount: transcriptionSegments.length, style: bRollStyle, maxMoments: bRollMaxMoments });
    if (generateBRoll && transcriptionSegments.length > 0) {
      logger.info('Step 3.5: Generating AI B-Roll animations');

      // Identify key moments for B-roll using configured style and count
      const moments = await identifyBRollMoments(transcriptionSegments, bRollMaxMoments, bRollStyle);
      logger.info('Identified B-roll moments', { count: moments.length, style: bRollStyle });

      if (moments.length > 0) {
        // Create cutaways from identified moments - pass context for animation generation
        const cutaways: BRollCutaway[] = moments.map(moment => ({
          timestamp: moment.timestamp,
          duration: moment.duration,
          context: moment.context, // Pass context for contextual animation
        }));

        // Insert animated cutaways into video with configured style
        stepOutput = path.join(processedDir, `${baseName}_broll.mp4`);
        await insertBRollCutaways(currentInput, stepOutput, cutaways, processedDir, bRollStyle);

        // Clean up intermediate file
        if (currentInput !== inputPath) {
          await fs.unlink(currentInput).catch(() => {})
        }
        currentInput = stepOutput;
      }
    }
    */

    // Step 4: Add headline if provided or using hook
    // Wrapped in try-catch so headline failures don't crash the entire pipeline
    if (finalHeadline) {
      logger.info('Step 4: Adding headline', { headline: finalHeadline });
      stepOutput = path.join(processedDir, `${baseName}_final.mp4`);
      intermediateFiles.push(stepOutput); // Track for cleanup on error
      try {
        await addHeadline(currentInput, stepOutput, finalHeadline, options.headlinePosition, captionStyle, options.headlineStyle);
        // Clean up intermediate file (and remove from tracking)
        if (currentInput !== inputPath) {
          await fs.unlink(currentInput).catch(() => {});
          const idx = intermediateFiles.indexOf(currentInput);
          if (idx > -1) intermediateFiles.splice(idx, 1);
        }
        currentInput = stepOutput;
      } catch (headlineErr) {
        logger.error('Step 4: Headline failed, continuing without headline', { error: String(headlineErr) });
        // Remove the failed output from tracking since it wasn't created
        const idx = intermediateFiles.indexOf(stepOutput);
        if (idx > -1) intermediateFiles.splice(idx, 1);
      }
    }

    // Step 5: Convert aspect ratio if specified
    if (aspectRatio && aspectRatio !== 'original') {
      logger.info('Step 5: Converting aspect ratio', { aspectRatio });
      stepOutput = path.join(processedDir, `${baseName}_aspect.mp4`);
      intermediateFiles.push(stepOutput); // Track for cleanup on error
      await convertAspectRatio(currentInput, stepOutput, aspectRatio as AspectRatioPreset);
      // Clean up intermediate file (and remove from tracking)
      if (currentInput !== inputPath) {
        await fs.unlink(currentInput).catch(() => {});
        const idx = intermediateFiles.indexOf(currentInput);
        if (idx > -1) intermediateFiles.splice(idx, 1);
      }
      currentInput = stepOutput;
    }

    // Rename to final output - use headline or hook as filename if available
    // Priority: displayed headline > extracted hook > original filename
    const filenameText = finalHeadline || hookText;
    let outputBaseName = baseName;
    if (filenameText) {
      // Sanitize text for use as filename
      outputBaseName = filenameText
        .replace(/[^\w\s-]/g, '')  // Remove special characters
        .replace(/\s+/g, '_')      // Replace spaces with underscores
        .substring(0, 50)          // Limit length
        .toLowerCase()
        .trim();
      // Fallback to original if sanitization results in empty string
      if (!outputBaseName) {
        outputBaseName = baseName;
      }
    }
    const finalOutput = path.join(processedDir, `${outputBaseName}_processed.mp4`);
    if (currentInput !== finalOutput) {
      await fs.rename(currentInput, finalOutput);
    }

    const outputFilename = path.basename(finalOutput);

    // Upload processed video to R2 if S3 is configured
    let processedUrl: string;
    if (isS3Configured()) {
      logger.info('Uploading processed video to R2');
      const processedS3Key = await uploadProcessedVideo(finalOutput, outputFilename);
      processedUrl = processedS3Key; // Store S3 key in database

      // Delete local processed file after upload
      try {
        await fs.unlink(finalOutput);
        logger.debug('Cleaned up local processed file after R2 upload');
      } catch (cleanupErr) {
        logger.warn('Failed to clean up local processed file', { error: String(cleanupErr) });
      }
    } else {
      // Fallback to local storage if S3 not configured
      processedUrl = `/api/download/${outputFilename}`;
    }

    // Track usage and update video record if user is authenticated
    if (dbUserId) {
      // Only increment video count for new videos, not reprocesses
      if (!isReprocess) {
        await incrementVideoCount(dbUserId);
        logger.info('Video count incremented for new video');
      } else {
        logger.info('Skipped video count increment (reprocess)');
      }

      // Update video record to COMPLETED with the processed URL (S3 key or local path)
      await updateVideoStatus('COMPLETED', { processedUrl });
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

    // Clean up S3 source file if it was downloaded from there
    if (s3Key && downloadedFromS3 && isS3Configured()) {
      try {
        await deleteS3Object(s3Key);
        logger.debug('Cleaned up S3 source file');
      } catch (s3CleanupErr) {
        logger.warn('Failed to clean up S3 file', { error: String(s3CleanupErr) });
      }
    }

    // Release file lock now that processing is complete
    releaseFileLock(inputPath);
    logger.debug('Released file lock after successful processing', { inputPath });

    logger.info('Processing complete', { outputFilename, processedUrl, videoId: videoRecordId });
    return NextResponse.json({
      success: true,
      outputFilename,
      downloadUrl: `/api/download/${outputFilename}`,
      processedUrl, // Include S3 key or local path for client
      videoId: videoRecordId, // Include videoId for reprocessing
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Processing error', { error: errorMessage, videoId: videoRecordId });

    // Release file lock if one was acquired
    if (lockedFilePath) {
      releaseFileLock(lockedFilePath);
      logger.debug('Released file lock after error', { lockedFilePath });
    }

    // Clean up intermediate files created during processing
    if (intermediateFiles.length > 0) {
      logger.info('Cleaning up intermediate files after error', { count: intermediateFiles.length });
      for (const file of intermediateFiles) {
        try {
          if (existsSync(file)) {
            await fs.unlink(file);
            logger.debug('Cleaned up intermediate file', { file });
          }
        } catch (cleanupErr) {
          logger.warn('Failed to clean up intermediate file', { file, error: String(cleanupErr) });
        }
      }
    }

    // Clean up input file if it was downloaded from S3
    if (inputFilePath && existsSync(inputFilePath)) {
      try {
        await fs.unlink(inputFilePath);
        logger.debug('Cleaned up input file after error', { inputFilePath });
      } catch (cleanupErr) {
        logger.warn('Failed to clean up input file', { inputFilePath, error: String(cleanupErr) });
      }
    }

    // Update ONLY this specific video to FAILED (not all user videos)
    // The videoRecordId is captured in the outer scope when the record is created
    if (videoRecordId) {
      try {
        await prisma.video.update({
          where: { id: videoRecordId },
          data: {
            status: 'FAILED',
            errorMessage: errorMessage,
          },
        });
        logger.info('Video status updated to FAILED', { videoId: videoRecordId });
      } catch (dbError) {
        logger.error('Failed to update video status on error', { videoId: videoRecordId, error: String(dbError) });
      }
    }

    return NextResponse.json(
      { error: 'Failed to process video. Please try again.' },
      { status: 500 }
    );
  }
}
