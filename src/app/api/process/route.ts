import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { removeSilence, ProcessingOptions, applyCombinedFilters } from '@/lib/ffmpeg';
import { transcribeVideo, extractHook, TranscriptionWord, generateAIHeadline, generateSrt, generateSrtFromWords, generateAnimatedAss } from '@/lib/whisper';
import { buildSegmentMap, remapTranscriptionSegments, remapWords } from '@/lib/timestampRemap';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { canProcessVideo, incrementVideoCount } from '@/lib/user';
import { cleanupOldFiles } from '@/lib/cleanup';
import { isS3Configured, getS3ObjectStream, deleteS3Object, uploadProcessedVideo } from '@/lib/s3';
import { logger } from '@/lib/logger';
import { checkRateLimit, rateLimitResponse, getRateLimitIdentifier } from '@/lib/rateLimit';
import { acquireFileLock, releaseFileLock } from '@/lib/fileLock';
import { setProgress, clearProgress } from '@/lib/progressStore';

// Allow up to 10 minutes for video processing (transcription, silence removal, etc.)
export const maxDuration = 600;

export async function POST(request: NextRequest) {
  // Track locked file path for cleanup in error handler
  let lockedFilePath: string | null = null;
  // Track video record ID for per-video error handling
  let videoRecordId: string | null = null;
  // Track intermediate files for cleanup on error
  const intermediateFiles: string[] = [];
  // Track input file path for cleanup
  let inputFilePath: string | null = null;
  // Track whether file was downloaded from S3 (for cleanup decisions)
  let downloadedFromS3 = false;
  // Track fileId for progress cleanup in error handler
  let fileId: string | null = null;

  try {
    const body = await request.json();
    fileId = body.fileId || null;
    const {
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
      silencePreset,  // 'natural' | 'gentle' — controls silence removal style
      generateCaptions,
      useHookAsHeadline,
      generateAIHeadline: shouldGenerateAIHeadline,
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
    const updateVideoStatus = async (status: 'PROCESSING' | 'COMPLETED' | 'FAILED', data?: { processedUrl?: string; errorMessage?: string; transcript?: string }) => {
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

    // Acquire file lock EARLY to prevent cleanup from deleting the file
    // during S3 download or other async operations below.
    // This must happen before any cleanup can run.
    acquireFileLock(inputPath, undefined, videoRecordId || undefined);
    lockedFilePath = inputPath;
    inputFilePath = inputPath; // Track for cleanup on error
    logger.debug('Acquired file lock for processing', { inputPath });

    // Run cleanup of old files in background AFTER acquiring lock
    // This ensures our file is protected from cleanup
    setImmediate(() => cleanupOldFiles());

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
        if (lockedFilePath) releaseFileLock(lockedFilePath);
        lockedFilePath = null;
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
      if (lockedFilePath) releaseFileLock(lockedFilePath);
      lockedFilePath = null;
      return NextResponse.json(
        { error: 'Video file not found' },
        { status: 404 }
      );
    }

    // Atomically claim video for processing (idempotency check)
    // This prevents duplicate processing from multiple tabs or retried requests
    const claimed = await claimVideoForProcessing();
    if (!claimed) {
      // Do NOT release the file lock here - another request may be actively
      // processing this file. The lock will auto-expire after 15 minutes.
      lockedFilePath = null;
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
      autoSilenceThreshold: autoSilenceThreshold ?? true,
      silencePreset: silencePreset || undefined,
      headline: headline || undefined,
      headlinePosition: headlinePosition || 'top',
      headlineStyle: headlineStyle || 'speech-bubble',
      captionStyle: captionStyle || 'instagram',
    };

    // Determine what features need transcription
    const needsTranscription = generateCaptions || useHookAsHeadline || shouldGenerateAIHeadline;
    const needsEarlyTranscription = needsTranscription;

    // Determine the headline we'll use (before step counting so we know if we need captions+headline)
    // Note: AI headline text will be determined later, but we know if we need the step
    const willHaveHeadline = headline || useHookAsHeadline || shouldGenerateAIHeadline;

    // Calculate total processing steps for progress reporting
    let totalSteps = 1; // Step 1: Silence removal (always)
    if (needsTranscription) totalSteps++; // Transcription
    // Captions and headline are now combined into a single step when both are present
    if (generateCaptions || willHaveHeadline) totalSteps++; // Captions/Headline (combined pass)

    let currentStep = 0;
    const reportProgress = (label: string) => {
      currentStep++;
      if (fileId) {
        setProgress(fileId, { step: currentStep, totalSteps, stepLabel: label });
      }
    };
    const reportSubProgress = (substepLabel: string, percent?: number) => {
      if (fileId) {
        setProgress(fileId, { step: currentStep, totalSteps, stepLabel: 'Removing silence...', substepLabel, percent });
      }
    };

    // OPTIMIZATION: Run early transcription WITH word-level timestamps in parallel
    // Word timestamps are used by the hybrid silence removal pipeline for boundary refinement,
    // and also for hook/B-roll detection
    let earlyTranscriptionPromise: Promise<{ text: string; segments: { start: number; end: number; text: string }[]; words?: TranscriptionWord[] }> | null = null;

    if (needsEarlyTranscription) {
      // Start transcribing original video in parallel with silence removal
      logger.info('Starting parallel transcription of original video');
      earlyTranscriptionPromise = transcribeVideo(inputPath, processedDir, {
        animated: false,
        forSpeechCorrection: false,
      }).then(t => ({ text: t.text, segments: t.segments, words: t.words }));
    }

    // Step 1: Remove silence using VAD-primary pipeline
    // No longer needs word timestamps — VAD handles detection directly
    // Use lossless intermediate encoding when another encode pass will follow
    const willReEncode = generateCaptions || !!willHaveHeadline;
    reportProgress('Removing silence...');
    logger.info('Step 1: Removing silence');
    stepOutput = path.join(processedDir, `${baseName}_nosilence.mp4`);
    intermediateFiles.push(stepOutput); // Track for cleanup on error
    const silenceResult = await removeSilence(currentInput, stepOutput, { ...options, isIntermediate: willReEncode }, undefined, reportSubProgress);
    const { keptSegments } = silenceResult;
    // Clean up intermediate file (and remove from tracking since it's deleted)
    if (currentInput !== inputPath) {
      await fs.unlink(currentInput).catch(() => {});
      const idx = intermediateFiles.indexOf(currentInput);
      if (idx > -1) intermediateFiles.splice(idx, 1);
    }
    currentInput = stepOutput;

    // Get early transcription result if we started one (may already be resolved from hybrid mode)
    let earlyTranscription: { text: string; segments: { start: number; end: number; text: string }[]; words?: TranscriptionWord[] } | null = null;
    if (earlyTranscriptionPromise) {
      try {
        logger.info('Getting parallel transcription result');
        earlyTranscription = await earlyTranscriptionPromise;
        logger.info('Parallel transcription completed');
      } catch (earlyTranscriptionErr) {
        logger.warn('Early transcription failed', {
          error: earlyTranscriptionErr instanceof Error ? earlyTranscriptionErr.message : String(earlyTranscriptionErr),
        });
      }
    }

    // Step 2: Transcribe the SILENCE-REMOVED video (only if needed for captions)
    let srtPath: string | undefined;
    let hookText: string | undefined;
    let aiHeadlineText: string | undefined;
    let transcriptionSegments: { start: number; end: number; text: string }[] = [];

    if (needsTranscription) {
      reportProgress('Transcribing audio...');

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

      // Generate captions: prefer remapping early transcription over re-transcribing
      if (generateCaptions) {
        let usedRemap = false;

        // Try timestamp remapping from early transcription + kept segments
        if (earlyTranscription && earlyTranscription.segments.length > 0) {
          try {
            logger.info('Remapping timestamps from early transcription');
            const segmentMap = buildSegmentMap(keptSegments);
            const remappedSegments = remapTranscriptionSegments(earlyTranscription.segments, segmentMap);

            // Sanity check: if we lost more than 20% of segments, fall back to re-transcription
            const retention = remappedSegments.length / earlyTranscription.segments.length;
            if (retention >= 0.8) {
              transcriptionSegments = remappedSegments;

              // Generate subtitle file from remapped data
              const subtitleBaseName = path.basename(currentInput, path.extname(currentInput));
              if (captionStyle === 'animated' && earlyTranscription.words && earlyTranscription.words.length > 0) {
                const remappedWords = remapWords(earlyTranscription.words, segmentMap);
                srtPath = path.join(processedDir, `${subtitleBaseName}.ass`);
                generateAnimatedAss(remappedWords, srtPath);
                logger.info(`Generated animated ASS from remapped words (${remappedWords.length} words)`);
              } else if (earlyTranscription.words && earlyTranscription.words.length > 0) {
                // Use word-level remapping for precise SRT timing after silence removal
                const remappedWords = remapWords(earlyTranscription.words, segmentMap);
                srtPath = path.join(processedDir, `${subtitleBaseName}.srt`);
                generateSrtFromWords(remappedWords, srtPath);
                logger.info(`Generated SRT from remapped words (${remappedWords.length} words)`);
              } else {
                srtPath = path.join(processedDir, `${subtitleBaseName}.srt`);
                generateSrt(remappedSegments, srtPath);
                logger.info(`Generated SRT from remapped segments (${remappedSegments.length} segments)`);
              }

              usedRemap = true;
              logger.info(`Timestamp remap succeeded (retention: ${(retention * 100).toFixed(0)}%)`);
            } else {
              logger.warn(`Timestamp remap retention too low (${(retention * 100).toFixed(0)}%), falling back to re-transcription`);
            }
          } catch (remapErr) {
            logger.warn('Timestamp remapping failed, falling back to re-transcription', {
              error: remapErr instanceof Error ? remapErr.message : String(remapErr),
            });
          }
        }

        // Fall back to full re-transcription if remap wasn't used
        if (!usedRemap) {
          logger.info('Step 2: Transcribing silence-removed video for captions');
          const transcription = await transcribeVideo(currentInput, processedDir, {
            animated: captionStyle === 'animated',
          });
          srtPath = transcription.srtPath;
          transcriptionSegments = transcription.segments;
        }

        // Extract hook if not already done from early transcription
        if (!hookText) {
          const fallbackText = transcriptionSegments.map(s => s.text).join(' ');
          hookText = extractHook(fallbackText);
          logger.info('Extracted hook from transcription segments', { hookText });
        }

        // Generate AI headline if not already done from early transcription
        if (shouldGenerateAIHeadline && !aiHeadlineText) {
          logger.info('Generating AI headline from transcription segments');
          try {
            const aiResult = await generateAIHeadline(transcriptionSegments);
            aiHeadlineText = aiResult.headline;
            logger.info('AI headline generated', { headline: aiHeadlineText, confidence: aiResult.confidence });
          } catch (aiError) {
            logger.error('AI headline generation failed, falling back to hook extraction', { error: String(aiError) });
            const fallbackText = transcriptionSegments.map(s => s.text).join(' ');
            aiHeadlineText = extractHook(fallbackText);
          }
        }
      }

      // Clean up SRT file reference (actual deletion handled after combined pass)
    }

    // Priority: AI headline > Hook from video > Manual headline
    const finalHeadline = shouldGenerateAIHeadline ? aiHeadlineText : (useHookAsHeadline ? hookText : options.headline);

    // Step 3+4 COMBINED: Apply captions and/or headline in a single FFmpeg pass
    // This avoids two separate re-encodes and significantly speeds up processing
    const hasCaptions = generateCaptions && srtPath;
    const hasHeadline = !!finalHeadline;

    if (hasCaptions || hasHeadline) {
      const parts: string[] = [];
      if (hasCaptions) parts.push('captions');
      if (hasHeadline) parts.push('headline');
      reportProgress(`Adding ${parts.join(' & ')}...`);
      logger.info(`Combined pass: Adding ${parts.join(' + ')}`, { headline: finalHeadline || 'none' });

      stepOutput = path.join(processedDir, `${baseName}_filtered.mp4`);
      intermediateFiles.push(stepOutput);

      try {
        await applyCombinedFilters(currentInput, stepOutput, {
          srtPath: hasCaptions ? srtPath : undefined,
          headline: hasHeadline ? finalHeadline : undefined,
          headlinePosition: options.headlinePosition,
          headlineStyle: options.headlineStyle,
          captionStyle: options.captionStyle,
        });
        // Clean up intermediate file (and remove from tracking)
        if (currentInput !== inputPath) {
          await fs.unlink(currentInput).catch(() => {});
          const idx = intermediateFiles.indexOf(currentInput);
          if (idx > -1) intermediateFiles.splice(idx, 1);
        }
        currentInput = stepOutput;
      } catch (combinedErr) {
        logger.error('Combined captions/headline pass failed, continuing without', { error: String(combinedErr) });
        const idx = intermediateFiles.indexOf(stepOutput);
        if (idx > -1) intermediateFiles.splice(idx, 1);
      }
    }

    // Clean up SRT file
    if (srtPath && existsSync(srtPath)) {
      await fs.unlink(srtPath).catch(() => {});
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
    // Include a short unique suffix from the fileId to prevent filename collisions
    // when the same video is processed multiple times (same headline → same base name).
    // This ensures each processed video has a distinct download URL and file path.
    const shortId = fileId ? fileId.substring(0, 8) : Date.now().toString(36);
    const finalOutput = path.join(processedDir, `${outputBaseName}_${shortId}_processed.mp4`);
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

    // Build transcript text from segments (available regardless of auth)
    const fullTranscript = transcriptionSegments.length > 0
      ? transcriptionSegments.map(s => s.text).join(' ').trim()
      : undefined;

    // Track usage and update video record if user is authenticated
    if (dbUserId) {
      // Only increment video count for new videos, not reprocesses
      if (!isReprocess) {
        await incrementVideoCount(dbUserId);
        logger.info('Video count incremented for new video');
      } else {
        logger.info('Skipped video count increment (reprocess)');
      }

      // Update video record to COMPLETED with the processed URL and transcript
      await updateVideoStatus('COMPLETED', { processedUrl, transcript: fullTranscript });
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

    // Clear progress tracking on completion
    if (fileId) clearProgress(fileId);

    logger.info('Processing complete', { outputFilename, processedUrl, videoId: videoRecordId });
    return NextResponse.json({
      success: true,
      outputFilename,
      downloadUrl: `/api/download/${outputFilename}`,
      processedUrl, // Include S3 key or local path for client
      videoId: videoRecordId, // Include videoId for reprocessing
      transcript: fullTranscript || undefined, // Include transcript for caption generation
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error('Processing error', { error: errorMessage, stack: errorStack, videoId: videoRecordId });

    // Clear progress tracking on error
    if (fileId) clearProgress(fileId);

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

    // Only clean up input file if it was downloaded from S3 (temporary local copy).
    // Do NOT delete locally uploaded files on error - they may be needed for retry.
    if (downloadedFromS3 && inputFilePath && existsSync(inputFilePath)) {
      try {
        await fs.unlink(inputFilePath);
        logger.debug('Cleaned up S3-downloaded input file after error', { inputFilePath });
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
