import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { removeSilence, burnCaptions, addHeadline, insertBRollCutaways, ProcessingOptions, BRollCutaway } from '@/lib/ffmpeg';
import { transcribeVideo, extractHook, identifyBRollMoments } from '@/lib/whisper';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { canProcessVideo, incrementVideoCount } from '@/lib/user';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      fileId,
      filename,
      headline,
      headlinePosition,
      captionStyle,
      silenceThreshold,
      silenceDuration,
      generateCaptions,
      useHookAsHeadline,
      generateBRoll,
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
    const inputPath = path.join(uploadsDir, filename);

    // Verify file exists
    if (!fs.existsSync(inputPath)) {
      return NextResponse.json(
        { error: 'Video file not found' },
        { status: 404 }
      );
    }

    // Ensure processed directory exists
    fs.mkdirSync(processedDir, { recursive: true });

    const baseName = path.basename(inputPath, path.extname(inputPath));
    let currentInput = inputPath;
    let stepOutput: string;

    const options: ProcessingOptions = {
      silenceThreshold: silenceThreshold ?? -35,
      silenceDuration: silenceDuration ?? 0.4,
      headline: headline || undefined,
      headlinePosition: headlinePosition || 'top',
      captionStyle: captionStyle || 'default',
    };

    // Step 1: Remove silence FIRST
    console.log('[Process] Step 1: Removing silence...');
    stepOutput = path.join(processedDir, `${baseName}_nosilence.mp4`);
    await removeSilence(currentInput, stepOutput, options);
    currentInput = stepOutput;

    // Step 2: Transcribe the SILENCE-REMOVED video (so timestamps match!)
    let srtPath: string | undefined;
    let hookText: string | undefined;
    let transcriptionSegments: { start: number; end: number; text: string }[] = [];

    if (generateCaptions || useHookAsHeadline || generateBRoll) {
      console.log('[Process] Step 2: Transcribing silence-removed video...');
      const transcription = await transcribeVideo(currentInput, processedDir);
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
