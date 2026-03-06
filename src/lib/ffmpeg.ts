import ffmpeg from 'fluent-ffmpeg';
import sharp from 'sharp';
import path from 'path';
import fs, { existsSync } from 'fs';
import { spawn } from 'child_process';
import { logger } from './logger';
import { runFFmpegCommand, runFFmpegWithRetry, runFFmpegSpawn, FFmpegProcessError, FFmpegProcessConfig, getMemoryEfficientOptions } from './ffmpegProcess';
import { detectSilenceWithVad, isSileroVadAvailable, SpeechSegment, SileroVadConfig, DEFAULT_VAD_CONFIG } from './sileroVadDetection';
import { refineWithWordBoundaries, refinedSegmentsToSilences, RefinedSpeechSegment, RefinementConfig, DEFAULT_REFINEMENT_CONFIG } from './hybridBoundaryRefinement';
import { buildFinalSegments, GapProcessingConfig, DEFAULT_GAP_CONFIG } from './gapProcessing';
import { buildCrossfadeFilterComplex, extractRoomTone, BoundaryRefinementConfig, DEFAULT_BOUNDARY_CONFIG } from './boundaryRefinement';
import { SilencePresetName, SILENCE_PRESETS, getConfigsFromPreset, validatePresetName } from './silencePresets';
import type { TranscriptionWord } from './whisper';

/**
 * Custom error class for file not found errors during video processing
 */
export class VideoFileNotFoundError extends Error {
  constructor(filePath: string) {
    super(`Video file not found: ${filePath}. The file may have been deleted or moved during processing.`);
    this.name = 'VideoFileNotFoundError';
  }
}

/**
 * Validates that a file exists before processing
 * @throws VideoFileNotFoundError if file doesn't exist
 */
export function validateFileExists(filePath: string, context?: string): void {
  if (!existsSync(filePath)) {
    const contextInfo = context ? ` (during ${context})` : '';
    logger.error(`File not found${contextInfo}`, { filePath });
    throw new VideoFileNotFoundError(filePath);
  }
}

/**
 * Safe ffprobe wrapper that validates file existence before calling ffprobe
 */
export function safeFFprobe(inputPath: string): Promise<ffmpeg.FfprobeData> {
  return new Promise((resolve, reject) => {
    validateFileExists(inputPath, 'ffprobe');
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) {
        // Check if it's a file not found error from ffprobe
        if (err.message?.includes('No such file or directory')) {
          return reject(new VideoFileNotFoundError(inputPath));
        }
        return reject(err);
      }
      resolve(metadata);
    });
  });
}
export interface SilenceInterval {
  start: number;
  end: number;
}

export type HeadlineStyle = 'classic' | 'speech-bubble' | 'clean';

export interface ProcessingOptions {
  silenceThreshold?: number; // in dB, default -30
  silenceDuration?: number; // minimum silence duration in seconds, default 0.35
  autoSilenceThreshold?: boolean; // auto-detect optimal threshold based on audio noise floor
  silencePreset?: SilencePresetName; // 'natural' | 'gentle' — controls VAD+gap aggressiveness
  headline?: string;
  headlinePosition?: 'top' | 'center' | 'bottom';
  headlineStyle?: HeadlineStyle;
  captionStyle?: 'instagram' | 'minimal';
  isIntermediate?: boolean; // Use lossless encoding for intermediate files that will be re-encoded
}

export interface RemoveSilenceResult {
  outputPath: string;
  keptSegments: SilenceInterval[];
}

/** Returns a random CRF between 17–19 for anti-fingerprinting. Visually indistinguishable but produces unique bitrate curves. */
function naturalCrf(): string {
  return String(17 + Math.floor(Math.random() * 3));
}

/** Returns metadata flags embedding the current timestamp as creation_time. */
function creationTimestamp(): string[] {
  return ['-metadata', `creation_time=${new Date().toISOString()}`];
}

// Caption styles optimized for safe zones
// FFmpeg subtitles filter uses default PlayRes of 384x288 for SRT files
// All margin values must be scaled to this coordinate system
// For 1080x1920 (9:16): Target captions in lower third, avoiding buttons and engagement icons
// Alignment=2 is bottom-center, MarginV is from bottom edge in PlayRes coordinates
const CAPTION_STYLE_MAP: Record<string, string> = {
  // Instagram style - white text on semi-transparent dark background box
  // Clean, modern, refined look with better readability on busy backgrounds
  // MarginV=70 ≈ 24% from bottom, MarginL=28, MarginR=53 for horizontal padding
  instagram: 'Fontname=Helvetica,FontSize=11,Bold=0,PrimaryColour=&HFFFFFF,BackColour=&H80000000,BorderStyle=4,Outline=0,Shadow=0,Alignment=2,MarginV=70,MarginL=28,MarginR=53',
  // Minimal style - clean white text with thin black outline, no background box
  // Subtle, modern look that lets the video show through
  minimal: 'Fontname=Helvetica,FontSize=11,Bold=0,PrimaryColour=&HFFFFFF,OutlineColour=&H00000000,BackColour=&H00000000,BorderStyle=1,Outline=1,Shadow=0,Alignment=2,MarginV=70,MarginL=28,MarginR=53',
};

/**
 * Single-pass audio analysis using asplit to fork into volumedetect + astats simultaneously.
 * Replaces the old multi-chunk analyzeFullVideoAudio + analyzeAudioPercentiles with one FFmpeg process.
 *
 * NOISE-AWARE: Uses speech-band filtering (200Hz-6000Hz) before analysis.
 */
async function analyzeAudioSinglePass(
  inputPath: string
): Promise<{ maxVolume: number; meanVolume: number; peakLevel: number; rmsLevel: number; dynamicRange: number }> {
  return new Promise((resolve) => {
    let statsOutput = '';

    // Use simple audio filter chain instead of complexFilter with asplit/anullsink.
    // The complex filter approach fails on Alpine Linux (ffmpeg exit code 218 / ENOSYS).
    // volumedetect passes audio through, so astats can run on the same stream.
    const command = ffmpeg(inputPath)
      .audioFilters(
        'highpass=f=200',
        'lowpass=f=6000',
        'volumedetect',
        'astats=measure_perchannel=Peak_level+RMS_level:measure_overall=Peak_level+RMS_level',
      )
      .format('null')
      .output('/dev/null');

    command
      .on('stderr', (line: string) => {
        statsOutput += line + '\n';
      })
      .on('end', () => {
        // Parse volumedetect output
        const meanMatch = statsOutput.match(/mean_volume:\s*(-?[\d.]+)\s*dB/i);
        const maxMatch = statsOutput.match(/max_volume:\s*(-?[\d.]+)\s*dB/i);
        // Parse astats output
        const peakMatch = statsOutput.match(/Peak level dB:\s*(-?[\d.]+)/i);
        const rmsMatch = statsOutput.match(/RMS level dB:\s*(-?[\d.]+)/i);

        const maxVolume = maxMatch ? parseFloat(maxMatch[1]) : -25;
        const meanVolume = meanMatch ? parseFloat(meanMatch[1]) : maxVolume - 15;
        const peakLevel = peakMatch ? parseFloat(peakMatch[1]) : maxVolume;
        const rmsLevel = rmsMatch ? parseFloat(rmsMatch[1]) : meanVolume;
        const dynamicRange = peakLevel - rmsLevel;

        logger.info(`[Audio SinglePass] max=${maxVolume.toFixed(1)}dB, mean=${meanVolume.toFixed(1)}dB, peak=${peakLevel.toFixed(1)}dB, rms=${rmsLevel.toFixed(1)}dB, DR=${dynamicRange.toFixed(1)}dB`);

        resolve({ maxVolume, meanVolume, peakLevel, rmsLevel, dynamicRange });
      })
      .on('error', (err: Error) => {
        logger.warn(`[Audio SinglePass] Error: ${err.message}, using defaults`);
        resolve({ maxVolume: -25, meanVolume: -30, peakLevel: -25, rmsLevel: -30, dynamicRange: 5 });
      })
      .run();
  });
}

/**
 * Calculate optimal silence threshold using multiple methods and combine them
 * This is the core of the adaptive threshold calculation
 *
 * AGGRESSIVE SETTINGS: Configured to detect and remove more silence
 * - Lower offsets mean threshold is closer to speech level = more silence detected
 * - Upper clamp raised to -12dB for more aggressive detection
 *
 * NOISE-AWARE: Handles background noise by adjusting strategy based on dynamic range
 * - Low dynamic range = noisy audio, rely more on peak-based threshold
 * - High dynamic range = clean audio, can use mean/RMS based thresholds
 */
function calculateAdaptiveThreshold(
  medianMax: number,
  medianMean: number,
  peakLevel?: number,
  rmsLevel?: number,
  dynamicRange?: number
): number {
  const thresholds: number[] = [];
  const weights: number[] = [];

  // Detect if audio is noisy based on dynamic range
  // Low dynamic range (<10dB) means noise floor is close to speech level
  const isNoisyAudio = dynamicRange !== undefined && dynamicRange < 10;
  const isModerateNoise = dynamicRange !== undefined && dynamicRange < 15;

  // Method 1: Traditional max - offset (primary method for noisy audio)
  // For noisy audio: use smaller offset since speech-noise gap is small
  // For clean audio: use 16dB offset to preserve soft consonants and trailing syllables
  const peakOffset = isNoisyAudio ? 11 : (isModerateNoise ? 13 : 16);
  const traditionalThreshold = medianMax - peakOffset;
  thresholds.push(traditionalThreshold);
  // Higher weight for noisy audio since mean/RMS are less reliable
  weights.push(isNoisyAudio ? 1.5 : 1.0);

  // Method 2: Mean-based threshold (less reliable for noisy audio)
  // 5dB below mean preserves natural speech dynamics (soft consonants, trailing syllables)
  const meanBasedThreshold = medianMean - 4;
  thresholds.push(meanBasedThreshold);
  // Lower weight for noisy audio since mean is elevated by noise
  weights.push(isNoisyAudio ? 0.2 : 0.5);

  // Method 3: If we have astats data, use RMS-based calculation
  if (rmsLevel !== undefined && dynamicRange !== undefined) {
    // RMS represents the "energy" of the audio, silence should be well below RMS
    // For noisy audio: RMS is elevated, use smaller offset
    const rmsOffset = isNoisyAudio ? 3 : 5;
    const rmsBasedThreshold = rmsLevel - rmsOffset;
    thresholds.push(rmsBasedThreshold);
    // Lower weight for noisy audio
    weights.push(isNoisyAudio ? 0.3 : 0.8);

    // If dynamic range is large, there's a clear gap between speech and silence
    if (dynamicRange > 15) {
      // High dynamic range = clear distinction between speech and silence
      // Use 16dB offset — still well within the speech-silence gap
      const aggressiveThreshold = medianMax - 16;
      thresholds.push(aggressiveThreshold);
      weights.push(0.5);
    }

    // NOISE-AWARE: For noisy audio, add a peak-relative threshold
    // This helps when there's constant background noise
    if (isNoisyAudio && peakLevel !== undefined) {
      // Use peak level as reference, with small offset
      // This ensures we only keep the loudest parts (actual speech)
      const noiseAwareThreshold = peakLevel - 6;
      thresholds.push(noiseAwareThreshold);
      weights.push(0.8);  // High weight for noisy scenarios
      logger.debug(`[Adaptive Threshold] Noisy audio detected (DR=${dynamicRange?.toFixed(1)}dB), adding noise-aware threshold: ${noiseAwareThreshold.toFixed(1)}dB`);
    }
  }

  // Calculate weighted average
  let weightedSum = 0;
  let totalWeight = 0;
  for (let i = 0; i < thresholds.length; i++) {
    weightedSum += thresholds[i] * weights[i];
    totalWeight += weights[i];
  }

  let threshold = weightedSum / totalWeight;

  // Clamp to bounds (-50 to -16 dB) to prevent threshold from getting too close to speech levels
  // For noisy audio, allow higher threshold (up to -16dB) since speech-noise gap is smaller
  const upperLimit = isNoisyAudio ? -16 : -22;
  threshold = Math.min(upperLimit, Math.max(-50, threshold));

  // Enhanced logging for debugging
  const gapFromMax = medianMax - threshold;
  const noiseStatus = isNoisyAudio ? ' [NOISY AUDIO]' : (isModerateNoise ? ' [MODERATE NOISE]' : '');
  logger.info(`[Adaptive Threshold] Input: medianMax=${medianMax.toFixed(1)}dB, medianMean=${medianMean.toFixed(1)}dB${rmsLevel !== undefined ? `, rms=${rmsLevel.toFixed(1)}dB` : ''}${dynamicRange !== undefined ? `, dynamicRange=${dynamicRange.toFixed(1)}dB` : ''}${noiseStatus}`);
  logger.info(`[Adaptive Threshold] Methods: ${thresholds.map((t, i) => `${t.toFixed(1)}dB(w=${weights[i]})`).join(', ')}`);
  logger.info(`[Adaptive Threshold] Result: ${threshold.toFixed(1)}dB (${gapFromMax.toFixed(1)}dB below peak)${noiseStatus}`);

  return threshold;
}

/**
 * Phase 2: Dual-pass detection with verification
 * Runs silence detection twice with different thresholds and verifies results
 * If the more sensitive pass finds significantly more silences, the threshold may be too conservative
 *
 * AGGRESSIVE MODE: Prefers finding more silence to cut
 */
async function dualPassSilenceDetection(
  inputPath: string,
  primaryThreshold: number,
  minDuration: number,
  videoDuration: number
): Promise<{ silences: SilenceInterval[]; threshold: number; wasAdjusted: boolean }> {
  // First pass with primary threshold
  logger.debug(`[Dual-Pass] First pass with threshold: ${primaryThreshold.toFixed(1)} dB`);
  const primarySilences = await detectSilence(inputPath, primaryThreshold, minDuration);

  const primaryTotalSilence = primarySilences.reduce((sum, s) => sum + (s.end - s.start), 0);
  const primarySilencePercent = (primaryTotalSilence / videoDuration) * 100;

  logger.debug(`[Dual-Pass] First pass: ${primarySilences.length} silences, ${primarySilencePercent.toFixed(1)}% of video`);

  // AGGRESSIVE: Second pass with even more sensitive threshold (-3 dB, was -5)
  // Smaller delta means we're already close to optimal with the aggressive primary
  const sensitiveThreshold = primaryThreshold - 3;
  logger.debug(`[Dual-Pass] Second pass with threshold: ${sensitiveThreshold.toFixed(1)} dB`);
  const sensitiveSilences = await detectSilence(inputPath, sensitiveThreshold, minDuration);

  const sensitiveTotalSilence = sensitiveSilences.reduce((sum, s) => sum + (s.end - s.start), 0);
  const sensitiveSilencePercent = (sensitiveTotalSilence / videoDuration) * 100;

  logger.debug(`[Dual-Pass] Second pass: ${sensitiveSilences.length} silences, ${sensitiveSilencePercent.toFixed(1)}% of video`);

  // Decision logic - AGGRESSIVE: prefer whichever finds more silence
  let finalSilences = primarySilences;
  let finalThreshold = primaryThreshold;
  let wasAdjusted = false;

  // AGGRESSIVE: If primary found less than 40% silence and sensitive found more (>1.15x)
  // Much more willing to use the sensitive (higher threshold) results
  if (primarySilencePercent < 25 && sensitiveSilencePercent > primarySilencePercent * 1.3) {
    logger.debug(`[Dual-Pass] Using more aggressive sensitive results for better silence removal`);
    finalSilences = sensitiveSilences;
    finalThreshold = sensitiveThreshold;
    wasAdjusted = true;
  }

  // If primary found too much silence (>85%), threshold might be too aggressive
  // But this is rare with our settings - only warn at very high levels
  if (primarySilencePercent > 85) {
    logger.warn(`[Dual-Pass] Warning: Very high silence percentage (${primarySilencePercent.toFixed(1)}%), audio may be very quiet`);
  }

  // Sanity check: if still no silences found and sensitive pass found some, use those
  if (finalSilences.length === 0 && sensitiveSilences.length > 0) {
    logger.debug(`[Dual-Pass] No silences with primary, using sensitive results`);
    finalSilences = sensitiveSilences;
    finalThreshold = sensitiveThreshold;
    wasAdjusted = true;
  }

  const finalTotalSilence = finalSilences.reduce((sum, s) => sum + (s.end - s.start), 0);
  const finalSilencePercent = (finalTotalSilence / videoDuration) * 100;
  logger.info(`[Dual-Pass] Final: ${finalSilences.length} silences (${finalSilencePercent.toFixed(1)}%), threshold=${finalThreshold.toFixed(1)}dB${wasAdjusted ? ' (adjusted)' : ''} [AGGRESSIVE]`);

  return { silences: finalSilences, threshold: finalThreshold, wasAdjusted };
}

/**
 * Adaptive silence detection - combines all three phases for robust detection
 * Phase 1: Full-video analysis in chunks
 * Phase 2: Dual-pass detection with verification
 * Phase 3: Percentile-based threshold calculation
 */
export async function detectSilenceAdaptive(
  inputPath: string,
  minDuration: number = 0.3  // AGGRESSIVE: Reduced from 0.5 to catch shorter silences
): Promise<{ silences: SilenceInterval[]; threshold: number; analysisInfo: string }> {
  // Get video duration first
  const videoDuration = await getVideoDuration(inputPath);

  logger.info(`[Adaptive Silence] Starting adaptive detection for ${videoDuration.toFixed(1)}s video`);

  // Single-pass analysis: volumedetect + astats in one FFmpeg process
  const { maxVolume, meanVolume, peakLevel, rmsLevel, dynamicRange } = await analyzeAudioSinglePass(inputPath);

  // Calculate adaptive threshold
  const adaptiveThreshold = calculateAdaptiveThreshold(
    maxVolume,
    meanVolume,
    peakLevel,
    rmsLevel,
    dynamicRange
  );

  logger.info(`[Adaptive Silence] Calculated adaptive threshold: ${adaptiveThreshold.toFixed(1)} dB`);

  // Phase 2: Dual-pass detection
  const { silences, threshold, wasAdjusted } = await dualPassSilenceDetection(
    inputPath,
    adaptiveThreshold,
    minDuration,
    videoDuration
  );

  const totalSilence = silences.reduce((sum, s) => sum + (s.end - s.start), 0);
  const silencePercent = (totalSilence / videoDuration) * 100;

  const analysisInfo = `Adaptive detection: maxVolume=${maxVolume.toFixed(1)}dB, threshold=${threshold.toFixed(1)}dB${wasAdjusted ? ' (adjusted)' : ''}, ${silences.length} silences (${silencePercent.toFixed(1)}%)`;

  logger.info(`[Adaptive Silence] ${analysisInfo}`);

  return { silences, threshold, analysisInfo };
}

/**
 * Detect the optimal silence threshold for a video's audio track
 * Uses volumedetect to find the max volume level (peak speech), then sets threshold relative to that.
 *
 * The logic: max_volume represents peak speech levels (the loudest parts).
 * Silence/pauses are typically 20-25 dB below speech peaks.
 * This is more reliable than mean because mean gets dragged down by silence.
 *
 * @deprecated Use detectSilenceAdaptive for more robust detection
 * Performance: Only samples first 30 seconds for fast analysis during bulk processing
 */
export async function detectNoiseFloor(
  inputPath: string,
  sampleDuration: number = 30 // Only analyze first N seconds for performance
): Promise<{ noiseFloor: number; recommendedThreshold: number }> {
  return new Promise((resolve) => {
    let statsOutput = '';

    logger.debug(`[Audio Analysis] Analyzing audio levels (sampling ${sampleDuration}s)`);

    // Use volumedetect filter to get mean and max volume
    const command = ffmpeg(inputPath)
      .inputOptions(['-t', String(sampleDuration)]) // Only sample first N seconds
      .audioFilters('volumedetect')
      .format('null')
      .output('/dev/null');

    command
      .on('stderr', (line: string) => {
        statsOutput += line + '\n';
      })
      .on('end', () => {
        // Parse volumedetect output for mean_volume and max_volume
        // Format: [Parsed_volumedetect_0 @ ...] mean_volume: -XX.X dB
        // Format: [Parsed_volumedetect_0 @ ...] max_volume: -XX.X dB
        const meanMatch = statsOutput.match(/mean_volume:\s*(-?[\d.]+)\s*dB/i);
        const maxMatch = statsOutput.match(/max_volume:\s*(-?[\d.]+)\s*dB/i);

        if (!maxMatch) {
          logger.debug(`[Audio Analysis] Could not detect max volume, using defaults`);
          resolve({ noiseFloor: -40, recommendedThreshold: -25 });
          return;
        }

        const maxVolume = parseFloat(maxMatch[1]);
        const meanVolume = meanMatch ? parseFloat(meanMatch[1]) : maxVolume - 15;

        // Use max volume (peak speech) as reference point
        // Silence is typically 20-25 dB below peak speech levels
        // Set threshold at max - 22 dB as a good middle ground
        //
        // Examples:
        // - max = -3 dB (normalized audio) → threshold = -25 dB
        // - max = -8 dB (slightly quieter) → threshold = -30 dB
        // - max = 0 dB (loud/clipped) → threshold = -22 dB
        const offsetFromMax = 22;
        let recommendedThreshold = maxVolume - offsetFromMax;

        // Clamp to reasonable bounds (-50 to -15 dB)
        recommendedThreshold = Math.min(-15, Math.max(-50, recommendedThreshold));

        logger.debug(`[Audio Analysis] Max volume: ${maxVolume.toFixed(1)} dB, Mean volume: ${meanVolume.toFixed(1)} dB`);
        logger.debug(`[Audio Analysis] Recommended threshold: ${recommendedThreshold.toFixed(1)} dB (max - ${offsetFromMax})`);

        resolve({ noiseFloor: meanVolume, recommendedThreshold });
      })
      .on('error', (err: Error) => {
        logger.error(`[Audio Analysis] Error analyzing audio:`, err);
        // Return defaults on error rather than failing
        resolve({ noiseFloor: -40, recommendedThreshold: -25 });
      })
      .run();
  });
}

/**
 * Detect silent intervals in a video
 *
 * NOISE-AWARE: Uses speech-band filtering (200Hz-6000Hz) to focus on voice frequencies
 * and ignore background noise (low rumble, high hiss) that can interfere with detection
 */
export async function detectSilence(
  inputPath: string,
  threshold: number = -20,
  minDuration: number = 0.4,  // Relaxed from 0.35 to avoid cutting sentence endings and short natural pauses
  useSpeechBandFilter: boolean = true  // Filter to speech frequencies for noise rejection
): Promise<SilenceInterval[]> {
  return new Promise((resolve, reject) => {
    const silences: SilenceInterval[] = [];
    let currentSilenceStart: number | null = null;

    // Build audio filter chain
    // Speech band: 200Hz - 6000Hz covers fundamental frequencies, harmonics, and sibilants
    // This helps reject:
    // - Low frequency rumble (AC hum, traffic, HVAC) below 200Hz
    // - High frequency hiss (electronics, wind) above 6000Hz
    // Raised from 3500Hz to 6000Hz so trailing consonants (s, sh, f, th) are detected as speech
    const speechBandFilter = useSpeechBandFilter
      ? 'highpass=f=200,lowpass=f=6000,'
      : '';
    const audioFilter = `${speechBandFilter}silencedetect=noise=${threshold}dB:d=${minDuration}`;

    logger.debug(`[Silence Detection] Starting with threshold=${threshold}dB, minDuration=${minDuration}s, speechBand=${useSpeechBandFilter}`);

    ffmpeg(inputPath)
      .audioFilters(audioFilter)
      .format('null')
      .output('/dev/null')
      .on('stderr', (line: string) => {
        // Parse silence_start
        const startMatch = line.match(/silence_start: ([\d.]+)/);
        if (startMatch) {
          currentSilenceStart = parseFloat(startMatch[1]);
          logger.debug(`[Silence Detection] Found silence start at ${currentSilenceStart}s`);
        }

        // Parse silence_end
        const endMatch = line.match(/silence_end: ([\d.]+)/);
        if (endMatch && currentSilenceStart !== null) {
          const endTime = parseFloat(endMatch[1]);
          silences.push({
            start: currentSilenceStart,
            end: endTime,
          });
          logger.debug(`[Silence Detection] Found silence end at ${endTime}s (duration: ${(endTime - currentSilenceStart).toFixed(2)}s)`);
          currentSilenceStart = null;
        }
      })
      .on('end', () => {
        logger.debug(`[Silence Detection] Complete. Found ${silences.length} silent intervals`);
        resolve(silences);
      })
      .on('error', (err: Error) => {
        logger.error(`[Silence Detection] Error:`, err);
        reject(err);
      })
      .run();
  });
}

/**
 * Get video duration
 */
export async function getVideoDuration(inputPath: string): Promise<number> {
  const metadata = await safeFFprobe(inputPath);
  return metadata.format.duration || 0;
}

/**
 * Calculate non-silent segments from silence intervals
 * Includes padding and filtering for more accurate cuts
 *
 * AGGRESSIVE MODE: Tighter padding = more silence removed
 */
export function getNonSilentSegments(
  silences: SilenceInterval[],
  totalDuration: number,
  options: { padding?: number; minSegmentDuration?: number; mergeGap?: number; timebackPadding?: number; timebackPaddingEnd?: number } = {}
): SilenceInterval[] {
  // Balanced padding: aggressive detection but natural-sounding cuts
  const padding = options.padding ?? 0.015; // 15ms trim into speech edges (minimal, detector boundaries are accurate)
  const minSegmentDuration = options.minSegmentDuration ?? 0.1; // Ignore segments shorter than 100ms
  const mergeGap = options.mergeGap ?? 0.075; // Merge segments less than 75ms apart (reduces choppiness)
  const timebackPadding = options.timebackPadding ?? 0.15; // 150ms breathing room before speech
  const timebackPaddingEnd = options.timebackPaddingEnd ?? 0.25; // Post-speech padding — avoid clipping sentence tails

  let segments: SilenceInterval[] = [];
  let lastEnd = 0;

  for (const silence of silences) {
    if (silence.start > lastEnd) {
      // Add padding WITHIN the speech segment to ensure clean cuts
      // paddedStart: start slightly after silence ends (skip any residual silence)
      // paddedEnd: end slightly before silence starts (avoid capturing silence)
      const paddedStart = Math.max(0, lastEnd + padding);
      const paddedEnd = Math.min(totalDuration, silence.start - padding);
      // Only add segment if it's still valid after padding
      if (paddedEnd > paddedStart) {
        segments.push({ start: paddedStart, end: paddedEnd });
      }
    }
    lastEnd = silence.end;
  }

  // Add final segment if there's content after last silence
  if (lastEnd < totalDuration) {
    const paddedStart = Math.max(0, lastEnd + padding);
    // Only add if there's meaningful content after padding
    if (paddedStart < totalDuration) {
      segments.push({ start: paddedStart, end: totalDuration });
    }
  }

  // Filter out segments that are too short
  segments = segments.filter(seg => (seg.end - seg.start) >= minSegmentDuration);

  // Merge segments that are very close together
  if (segments.length > 1) {
    const mergedSegments: SilenceInterval[] = [segments[0]];
    for (let i = 1; i < segments.length; i++) {
      const prev = mergedSegments[mergedSegments.length - 1];
      const curr = segments[i];

      // If gap between segments is small, merge them
      if (curr.start - prev.end <= mergeGap) {
        prev.end = curr.end;
      } else {
        mergedSegments.push(curr);
      }
    }
    segments = mergedSegments;
  }

  // Apply timeback padding to expand segments (asymmetric: more room at end for speech trailing off)
  if (timebackPadding > 0 || timebackPaddingEnd > 0) {
    const expandedSegments = segments.map(seg => ({
      start: Math.max(0, seg.start - timebackPadding),
      end: Math.min(totalDuration, seg.end + timebackPaddingEnd),
    }));

    // Re-merge any segments that now overlap after expansion
    const finalSegments: SilenceInterval[] = [];
    for (const seg of expandedSegments) {
      if (finalSegments.length === 0) {
        finalSegments.push({ ...seg });
      } else {
        const last = finalSegments[finalSegments.length - 1];
        if (seg.start <= last.end) {
          // Segments overlap, merge them
          last.end = Math.max(last.end, seg.end);
        } else {
          finalSegments.push({ ...seg });
        }
      }
    }
    segments = finalSegments;
  }

  logger.debug(`[Segments] After filtering: ${segments.length} segments (padding=${padding}s, minDuration=${minSegmentDuration}s, mergeGap=${mergeGap}s, timebackPadding=${timebackPadding}s, timebackPaddingEnd=${timebackPaddingEnd}s)`);

  return segments;
}

/**
 * Remove silent parts from video using the hybrid three-layer pipeline:
 * 1. Silero VAD (primary) or FFmpeg silencedetect (fallback)
 * 2. Transcription word boundary refinement (when word timestamps available)
 * 3. Audio energy analysis with crossfades at splice points
 *
 * @param wordTimestamps - Optional word-level timestamps from transcription for boundary refinement
 */
export async function removeSilence(
  inputPath: string,
  outputPath: string,
  options: ProcessingOptions = {},
  wordTimestamps?: TranscriptionWord[],
  onProgress?: (substepLabel: string, percent?: number) => void
): Promise<RemoveSilenceResult> {
  // Validate input file exists before spawning any ffmpeg processes
  validateFileExists(inputPath, 'silence removal');

  const duration = await getVideoDuration(inputPath);
  const presetName = validatePresetName(options.silencePreset);
  const preset = SILENCE_PRESETS[presetName];
  const { vadConfig, refinementConfig, gapConfig } = getConfigsFromPreset(presetName);

  logger.info(`[Silence Removal] Starting hybrid pipeline (preset: ${presetName}, duration: ${duration.toFixed(1)}s)`);

  onProgress?.('Analyzing audio...', 0);

  // ── Hybrid pipeline: Silero VAD → word boundary refinement → gap processing ──
  // This produces far more accurate cuts than FFmpeg silencedetect alone.
  let segments: SilenceInterval[];
  let usedHybrid = false;

  const hasWords = wordTimestamps && wordTimestamps.length > 0;

  // Try Silero VAD first (neural speech detection)
  let speechSegments: SpeechSegment[] | null = null;
  let vadAvailable = false;

  try {
    vadAvailable = await isSileroVadAvailable();
  } catch {
    logger.warn('[Silence Removal] Silero VAD availability check failed');
  }

  if (vadAvailable) {
    try {
      logger.info('[Silence Removal] Running Silero VAD for neural speech detection...');
      const vadResult = await detectSilenceWithVad(inputPath, duration, vadConfig);
      speechSegments = vadResult.speechSegments;
      logger.info(`[Silence Removal] ${vadResult.analysisInfo}`);
    } catch (vadErr) {
      logger.warn('[Silence Removal] Silero VAD failed, falling back to FFmpeg silencedetect', {
        error: vadErr instanceof Error ? vadErr.message : String(vadErr),
      });
    }
  } else {
    logger.info('[Silence Removal] Silero VAD not available, using FFmpeg silencedetect');
  }

  onProgress?.('Detecting silence...', 20);

  if (speechSegments && speechSegments.length > 0 && hasWords) {
    // ── Full hybrid path: VAD + word boundaries + gap processing ──
    logger.info(`[Silence Removal] Hybrid path: ${speechSegments.length} VAD segments + ${wordTimestamps!.length} words`);

    // Layer 2: Refine VAD boundaries using word-level timestamps
    const refinedSegments = refineWithWordBoundaries(
      speechSegments,
      wordTimestamps!,
      duration,
      refinementConfig
    );

    // Layer 3: Intelligent gap processing with context-aware pause sizing
    segments = buildFinalSegments(refinedSegments, duration, gapConfig);
    usedHybrid = true;

    logger.info(`[Silence Removal] Hybrid pipeline: ${refinedSegments.length} refined → ${segments.length} final segments`);
  } else if (speechSegments && speechSegments.length > 0) {
    // ── VAD-only path (no word timestamps): use VAD segments with preset padding ──
    logger.info(`[Silence Removal] VAD-only path (no word timestamps): ${speechSegments.length} segments`);
    const fallbackPadMs = preset.speechPadMs;
    const paddedSegments = speechSegments.map(seg => ({
      start: Math.max(0, seg.start - fallbackPadMs / 1000),
      end: Math.min(duration, seg.end + fallbackPadMs / 1000),
    }));

    // Merge overlapping after padding
    const merged: SilenceInterval[] = [];
    for (const seg of paddedSegments) {
      if (merged.length === 0 || seg.start > merged[merged.length - 1].end) {
        merged.push({ ...seg });
      } else {
        merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, seg.end);
      }
    }
    segments = merged;
    usedHybrid = true;
  } else {
    // ── Fallback: FFmpeg silencedetect (legacy path) ──
    logger.info('[Silence Removal] Falling back to FFmpeg silencedetect');
    const minDuration = preset.minSilenceToRemoveMs / 1000;
    let silences: SilenceInterval[];

    if (options.autoSilenceThreshold !== false) {
      const adaptiveResult = await detectSilenceAdaptive(inputPath, minDuration);
      silences = adaptiveResult.silences;
      logger.info(`[Silence Removal] ${adaptiveResult.analysisInfo}`);
    } else {
      const threshold = options.silenceThreshold ?? -20;
      silences = await detectSilence(inputPath, threshold, options.silenceDuration ?? minDuration);
      logger.info(`[Silence Removal] Manual threshold: ${threshold}dB, found ${silences.length} silences`);
    }

    if (silences.length === 0) {
      logger.debug(`[Silence Removal] No silences found, copying original file`);
      fs.copyFileSync(inputPath, outputPath);
      return { outputPath, keptSegments: [{ start: 0, end: duration }] };
    }

    // If we have word timestamps but no VAD, still use word boundary refinement
    if (hasWords) {
      logger.info('[Silence Removal] Using word boundaries to refine FFmpeg silences');
      const ffmpegSpeechSegments = silencesToSpeechSegments(silences, duration);
      const refinedSegments = refineWithWordBoundaries(
        ffmpegSpeechSegments,
        wordTimestamps!,
        duration,
        refinementConfig
      );
      segments = buildFinalSegments(refinedSegments, duration, gapConfig);
    } else {
      segments = getNonSilentSegments(silences, duration, {
        padding: 0,
        minSegmentDuration: 0.1,
        mergeGap: 0.05,
        timebackPadding: preset.prePadMs / 1000,
        timebackPaddingEnd: preset.postPadMs / 1000,
      });
    }
  }

  onProgress?.('Detecting silence...', 30);

  // Validate word coverage (regardless of path)
  if (hasWords) {
    if (!usedHybrid) {
      // Only apply word protection in the legacy path without refinement
      segments = protectWordsFromClipping(segments, wordTimestamps!, duration, preset.postPadMs / 1000);
    }
    validateTranscriptCoverage(segments, wordTimestamps!);
  }

  logger.info(`[Silence Removal] ${segments.length} segments to keep`);

  // If no segments to keep, copy the original file
  if (segments.length === 0) {
    logger.debug(`[Silence Removal] No segments to keep, copying original file`);
    fs.copyFileSync(inputPath, outputPath);
    return { outputPath, keptSegments: [{ start: 0, end: duration }] };
  }

  // Step 3: Extract room tone for natural splice transitions
  // Skip when intermediate — room tone quality benefit is wasted on a file that will be re-encoded
  const isIntermediate = options.isIntermediate === true;
  const outputDir = path.dirname(outputPath);
  let roomTonePath: string | null = null;
  // Derive silence intervals from kept segments for room tone extraction
  const silenceIntervalsForRoomTone: SilenceInterval[] = [];
  if (segments.length > 0) {
    if (segments[0].start > 0.1) {
      silenceIntervalsForRoomTone.push({ start: 0, end: segments[0].start });
    }
    for (let i = 0; i < segments.length - 1; i++) {
      const gapStart = segments[i].end;
      const gapEnd = segments[i + 1].start;
      if (gapEnd - gapStart > 0.1) {
        silenceIntervalsForRoomTone.push({ start: gapStart, end: gapEnd });
      }
    }
    if (duration - segments[segments.length - 1].end > 0.1) {
      silenceIntervalsForRoomTone.push({ start: segments[segments.length - 1].end, end: duration });
    }
  }
  if (!isIntermediate) {
    try {
      roomTonePath = await extractRoomTone(inputPath, silenceIntervalsForRoomTone, outputDir);
      if (roomTonePath) {
        logger.info(`[Silence Removal] Room tone extracted for ambient bed`);
      }
    } catch (roomToneErr) {
      logger.warn(`[Silence Removal] Room tone extraction failed, continuing without`, {
        error: roomToneErr instanceof Error ? roomToneErr.message : String(roomToneErr),
      });
    }
  }

  // Step 4: Build FFmpeg filter complex with crossfades at splice points
  const crossfadeMs = 5;
  const hasRoomTone = roomTonePath !== null;
  const { filterComplex } = buildCrossfadeFilterComplex(segments, crossfadeMs, hasRoomTone);

  if (!filterComplex) {
    logger.debug(`[Silence Removal] Empty filter complex, copying original file`);
    if (roomTonePath) fs.unlinkSync(roomTonePath);
    fs.copyFileSync(inputPath, outputPath);
    return { outputPath, keptSegments: segments };
  }

  onProgress?.('Encoding video...', 50);
  logger.debug(`[Silence Removal] Concatenating ${segments.length} segments with crossfades...`);

  // Calculate expected output duration for progress reporting
  const expectedDuration = segments.reduce((sum, s) => sum + (s.end - s.start), 0);

  // Encoding settings: lossless for intermediate files, quality for final output
  const videoCrf = isIntermediate ? '0' : naturalCrf();
  const videoPreset = isIntermediate ? 'ultrafast' : 'fast';
  const audioBitrate = isIntermediate ? '256k' : '128k';
  if (isIntermediate) {
    logger.info(`[Silence Removal] Using lossless intermediate encoding (CRF 0, audio 256k) — will be re-encoded later`);
  }

  // Use retry wrapper for resilience against SIGKILL/memory issues
  const processConfig: FFmpegProcessConfig = {
    timeout: 5 * 60 * 1000, // 5 minutes timeout
    maxRetries: 1, // Retry once on transient failures
    context: 'Silence Removal',
  };

  try {
    await runFFmpegWithRetry(() => {
      const cmd = ffmpeg(inputPath);
      if (roomTonePath) {
        cmd.input(roomTonePath);
      }
      const pipeline = cmd
        .complexFilter(filterComplex)
        .outputOptions([
          '-map', '[outv]',
          '-map', '[outa]',
          '-c:v', 'libx264',
          '-preset', videoPreset,
          '-crf', videoCrf,
          '-threads', '0',
          '-max_muxing_queue_size', '512',
          '-bufsize', '1M',
          '-c:a', 'aac',
          '-b:a', audioBitrate,
          // faststart moves moov atom to the front for instant mobile playback/preview.
          // Skip for intermediate files since they'll be re-encoded anyway.
          ...(isIntermediate ? [] : ['-movflags', '+faststart', '-pix_fmt', 'yuv420p']),
          ...(isIntermediate ? [] : creationTimestamp()),
        ])
        .output(outputPath);

      // Hook progress event for sub-step reporting
      if (onProgress && expectedDuration > 0) {
        pipeline.on('progress', (progress: { timemark?: string }) => {
          if (progress.timemark) {
            const parts = progress.timemark.split(':').map(Number);
            const currentSec = (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
            const pct = Math.min(99, Math.round(50 + (currentSec / expectedDuration) * 50));
            onProgress('Encoding video...', pct);
          }
        });
      }

      return pipeline;
    }, processConfig);

    // Clean up room tone file
    if (roomTonePath) {
      try { fs.unlinkSync(roomTonePath); } catch { /* ignore */ }
    }

    logger.debug(`[Silence Removal] Complete!`);
    return { outputPath, keptSegments: segments };
  } catch (err) {
    // Clean up room tone file on error
    if (roomTonePath) {
      try { fs.unlinkSync(roomTonePath); } catch { /* ignore */ }
    }
    if (err instanceof FFmpegProcessError) {
      if (err.isMemoryKill) {
        logger.error(`[Silence Removal] Process killed due to memory constraints.`);
        throw new Error('Video processing failed due to memory constraints. Try a shorter video or disable some processing options.');
      }
      if (err.isTimeout) {
        logger.error(`[Silence Removal] Process timed out`);
        throw new Error('Video processing timed out. The video may be too long or the server is under heavy load.');
      }
    }
    logger.error(`[Silence Removal] Error:`, err instanceof Error ? err : new Error(String(err)));
    throw err;
  }
}


/**
 * Convert silence intervals to speech segments (inverse operation)
 * Used when falling back from Silero VAD to FFmpeg silencedetect
 */
function silencesToSpeechSegments(
  silences: SilenceInterval[],
  totalDuration: number
): SpeechSegment[] {
  const segments: SpeechSegment[] = [];

  if (silences.length === 0) {
    // No silences = everything is speech
    return [{ start: 0, end: totalDuration, confidence: 1.0 }];
  }

  // Speech before first silence
  if (silences[0].start > 0.01) {
    segments.push({ start: 0, end: silences[0].start, confidence: 0.8 });
  }

  // Speech between silences
  for (let i = 0; i < silences.length - 1; i++) {
    const speechStart = silences[i].end;
    const speechEnd = silences[i + 1].start;
    if (speechEnd - speechStart > 0.01) {
      segments.push({ start: speechStart, end: speechEnd, confidence: 0.8 });
    }
  }

  // Speech after last silence
  const lastSilence = silences[silences.length - 1];
  if (totalDuration - lastSilence.end > 0.01) {
    segments.push({ start: lastSilence.end, end: totalDuration, confidence: 0.8 });
  }

  return segments;
}

/**
 * Protect words from being clipped by extending the nearest segment to cover them.
 * Focuses on sentence-ending words (trailing punctuation) which are most noticeable
 * when clipped, but also catches any other words that fall outside segments.
 *
 * This keeps the FFmpeg silence-detection approach as primary — the transcript
 * is only used as a safety net to extend segments where speech got misclassified
 * as silence.
 */
function protectWordsFromClipping(
  segments: SilenceInterval[],
  words: TranscriptionWord[],
  totalDuration: number,
  postPadSec: number
): SilenceInterval[] {
  if (words.length === 0 || segments.length === 0) return segments;

  // Work on a mutable copy
  const result = segments.map(s => ({ ...s }));
  let extended = 0;

  for (const word of words) {
    const wordEnd = word.end;
    const wordStart = word.start;

    // Find the segment that contains or is closest to this word
    let bestIdx = -1;
    let bestDist = Infinity;

    for (let i = 0; i < result.length; i++) {
      const seg = result[i];

      // Word is fully inside this segment — no action needed
      if (seg.start <= wordStart && wordEnd <= seg.end) {
        bestIdx = -1;
        break;
      }

      // Word overlaps the end of this segment (partially clipped) or
      // falls just after it — this is the sentence-ending clipping case
      if (wordStart < seg.end + 0.3 && wordEnd > seg.end) {
        bestIdx = i;
        break;
      }

      // Word overlaps the start of this segment (partially clipped) or
      // falls just before it
      if (wordEnd > seg.start - 0.3 && wordStart < seg.start) {
        bestIdx = i;
        break;
      }

      // Track closest segment for words that fall in gaps
      const dist = Math.min(
        Math.abs(wordStart - seg.end),
        Math.abs(seg.start - wordEnd)
      );
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    // Only extend if the word is reasonably close to a segment (within 0.5s)
    // Words far from any segment are likely transcription artifacts
    if (bestIdx >= 0 && bestDist <= 0.5) {
      const seg = result[bestIdx];
      const newStart = Math.max(0, Math.min(seg.start, wordStart - 0.03));
      const newEnd = Math.min(totalDuration, Math.max(seg.end, wordEnd + postPadSec));

      if (newStart < seg.start || newEnd > seg.end) {
        extended++;
        const trimmedWord = word.word.trim();
        const isSentenceEnd = /[.!?]$/.test(trimmedWord);
        logger.debug(
          `[Word Protection] Extended segment to cover "${trimmedWord}" at ${wordStart.toFixed(2)}s-${wordEnd.toFixed(2)}s` +
          (isSentenceEnd ? ' (sentence ending)' : '')
        );
        seg.start = newStart;
        seg.end = newEnd;
      }
    }
  }

  if (extended > 0) {
    logger.info(`[Word Protection] Extended ${extended} segment boundaries to protect words from clipping`);

    // Re-merge any segments that now overlap after extension
    result.sort((a, b) => a.start - b.start);
    const merged: SilenceInterval[] = [result[0]];
    for (let i = 1; i < result.length; i++) {
      const prev = merged[merged.length - 1];
      const curr = result[i];
      if (curr.start <= prev.end) {
        prev.end = Math.max(prev.end, curr.end);
      } else {
        merged.push(curr);
      }
    }
    return merged;
  }

  return result;
}

/**
 * Validate that every transcription word falls within a kept segment.
 * Logs warnings for any words that still got cut after protection.
 */
function validateTranscriptCoverage(
  segments: SilenceInterval[],
  words: TranscriptionWord[]
): void {
  if (words.length === 0 || segments.length === 0) return;

  const cutWords: TranscriptionWord[] = [];

  for (const word of words) {
    const wordMid = (word.start + word.end) / 2;
    const isCovered = segments.some(seg => seg.start <= wordMid && wordMid <= seg.end);
    if (!isCovered) {
      cutWords.push(word);
    }
  }

  if (cutWords.length > 0) {
    const percentage = ((cutWords.length / words.length) * 100).toFixed(1);
    logger.warn(
      `[Transcript Validation] ${cutWords.length}/${words.length} words (${percentage}%) still outside kept segments:`
    );
    for (const word of cutWords.slice(0, 10)) {
      logger.warn(
        `[Transcript Validation]   "${word.word}" at ${word.start.toFixed(2)}s-${word.end.toFixed(2)}s`
      );
    }
    if (cutWords.length > 10) {
      logger.warn(`[Transcript Validation]   ... and ${cutWords.length - 10} more`);
    }
  } else {
    logger.info(`[Transcript Validation] All ${words.length} words are covered by kept segments`);
  }
}

/**
 * Split headline into two balanced lines
 */
function splitHeadlineIntoTwoLines(headline: string): [string, string] {
  const words = headline.split(' ');
  if (words.length <= 2) {
    // Very short headline - put on one line each or split at middle char
    if (words.length === 1 && headline.length > 15) {
      const mid = Math.ceil(headline.length / 2);
      return [headline.slice(0, mid), headline.slice(mid)];
    }
    if (words.length === 2) {
      return [words[0], words[1]];
    }
    return [headline, ''];
  }

  // Find the best split point to balance line lengths
  let bestSplit = Math.ceil(words.length / 2);
  let bestDiff = Infinity;

  for (let i = 1; i < words.length; i++) {
    const line1 = words.slice(0, i).join(' ');
    const line2 = words.slice(i).join(' ');
    const diff = Math.abs(line1.length - line2.length);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestSplit = i;
    }
  }

  return [
    words.slice(0, bestSplit).join(' '),
    words.slice(bestSplit).join(' ')
  ];
}

/**
 * Estimate the pixel width of text rendered in a bold sans-serif font
 */
function estimateTextWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const ch of text) {
    if (ch === ' ') width += fontSize * 0.30;
    else if (ch >= 'A' && ch <= 'Z') width += fontSize * 0.73;
    else if (ch >= 'a' && ch <= 'z') width += fontSize * 0.58;
    else if (ch >= '0' && ch <= '9') width += fontSize * 0.62;
    else width += fontSize * 0.60; // punctuation, symbols
  }
  return width;
}

/**
 * Generate a transparent PNG image of a headline with rounded-rectangle background
 * Uses Sharp SVG rendering for Instagram-native rounded corners.
 * Supports accent words that get highlighted in a different color.
 */
async function generateHeadlinePNG(
  headline: string,
  style: HeadlineStyle,
  outputDir: string,
  canvasWidth: number = 1080,
  accentWords: string[] = [],
  accentColor: string = '#e85d26',
): Promise<{ pngPath: string; imageWidth: number; imageHeight: number }> {
  // XML-escape for SVG (not FFmpeg escaping)
  const xmlEscape = (s: string) => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const sanitized = headline
    .replace(/[^\x20-\x7E\u00C0-\u00FF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const [rawLine1, rawLine2] = splitHeadlineIntoTwoLines(sanitized);
  const hasSecondLine = rawLine2.length > 0;

  const fontSize = 48;
  const paddingX = 40;
  const paddingY = 28;
  const lineGap = 16;
  const borderRadius = 20;
  const maxWidth = canvasWidth - 120; // 60px margin each side
  const minWidth = 200;

  // Estimate text widths
  const line1Width = estimateTextWidth(rawLine1, fontSize);
  const line2Width = hasSecondLine ? estimateTextWidth(rawLine2, fontSize) : 0;
  const maxLineWidth = Math.max(line1Width, line2Width);

  // Clamp box width
  let boxWidth = Math.ceil(maxLineWidth + paddingX * 2);
  boxWidth = Math.max(minWidth, Math.min(boxWidth, maxWidth));

  // Calculate box height
  const lineCount = hasSecondLine ? 2 : 1;
  const boxHeight = Math.ceil(paddingY * 2 + fontSize * lineCount + lineGap * (lineCount - 1));

  // Style-specific colors
  const isClean = style === 'clean';
  const bgFill = style === 'speech-bubble' ? 'white' : 'black';
  const bgOpacity = isClean ? '0' : style === 'speech-bubble' ? '1' : '0.7';
  const defaultTextFill = style === 'speech-bubble' ? 'black' : 'white';

  // Build SVG with centered text on rounded rectangle
  const centerX = boxWidth / 2;
  // Vertical positioning: center text block within box
  const textBlockHeight = fontSize * lineCount + lineGap * (lineCount - 1);
  const textStartY = (boxHeight - textBlockHeight) / 2 + fontSize * 0.78; // 0.78 = approximate ascender ratio

  const fontWeight = isClean ? '500' : 'bold';

  // Normalize accent words for case-insensitive matching
  const accentSet = new Set(accentWords.map(w => w.toLowerCase().replace(/[^a-z0-9]/g, '')));

  /**
   * Build SVG tspan elements for a line, coloring accent words differently.
   */
  function buildAccentLine(rawLine: string, y: number): string {
    if (accentSet.size === 0) {
      // No accent words — render as a single text element (original behavior)
      const escaped = xmlEscape(rawLine);
      if (isClean) {
        return `<text x="${centerX}" y="${y}" text-anchor="middle" font-family="Liberation Sans, DejaVu Sans, Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="${fontWeight}" fill="white"><tspan stroke="black" stroke-width="1.5" stroke-opacity="0.3" paint-order="stroke">${escaped}</tspan></text>`;
      }
      return `<text x="${centerX}" y="${y}" text-anchor="middle" font-family="Liberation Sans, DejaVu Sans, Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="${fontWeight}" fill="${defaultTextFill}">${escaped}</text>`;
    }

    // Split line into words and build tspan elements with accent coloring
    const words = rawLine.split(/(\s+)/);
    const tspans = words.map(segment => {
      const escaped = xmlEscape(segment);
      if (segment.trim() === '') return escaped; // whitespace
      const normalized = segment.toLowerCase().replace(/[^a-z0-9]/g, '');
      const isAccent = accentSet.has(normalized);
      const fill = isAccent ? accentColor : defaultTextFill;
      if (isClean) {
        return `<tspan fill="${fill}" stroke="black" stroke-width="1.5" stroke-opacity="0.3" paint-order="stroke">${escaped}</tspan>`;
      }
      return `<tspan fill="${fill}">${escaped}</tspan>`;
    }).join('');

    return `<text x="${centerX}" y="${y}" text-anchor="middle" font-family="Liberation Sans, DejaVu Sans, Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="${fontWeight}">${tspans}</text>`;
  }

  let textElements = buildAccentLine(rawLine1, textStartY);
  if (hasSecondLine) {
    const line2Y = textStartY + fontSize + lineGap;
    textElements += '\n    ' + buildAccentLine(rawLine2, line2Y);
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${boxWidth}" height="${boxHeight}">
  <rect x="0" y="0" width="${boxWidth}" height="${boxHeight}" rx="${borderRadius}" ry="${borderRadius}" fill="${bgFill}" fill-opacity="${bgOpacity}"/>
  ${textElements}
</svg>`;

  const pngPath = path.join(outputDir, `headline_${Date.now()}.png`);
  await sharp(Buffer.from(svg)).png().toFile(pngPath);

  logger.debug(`[Headline] Generated PNG: ${boxWidth}x${boxHeight} at ${pngPath}` +
    (accentWords.length > 0 ? `, accent: [${accentWords.join(', ')}]` : ''));
  return { pngPath, imageWidth: boxWidth, imageHeight: boxHeight };
}

/**
 * Combined video processing options for single-pass encoding
 * This reduces multiple FFmpeg passes to a single pass when possible
 */
export interface CombinedProcessingOptions {
  srtPath?: string;
  headline?: string;
  headlinePosition?: 'top' | 'center' | 'bottom';
  headlineStyle?: HeadlineStyle;
  captionStyle?: string;
  accentWords?: string[];
  accentColor?: string;
}

/**
 * Apply multiple video filters in a single FFmpeg pass
 * This is more efficient than running separate passes for each filter
 * Combines captions and headline into one re-encode
 */
export async function applyCombinedFilters(
  inputPath: string,
  outputPath: string,
  options: CombinedProcessingOptions
): Promise<string> {
  // Build caption filter string (if captions provided)
  let captionFilter: string | null = null;
  let tempSubPath: string | null = null;

  if (options.srtPath && fs.existsSync(options.srtPath)) {
    const isAnimated = options.srtPath.endsWith('.ass');

    // Copy subtitle to a temp file with simple name to avoid FFmpeg path escaping issues
    const tempSubName = isAnimated ? 'temp_subs.ass' : 'temp_subs.srt';
    const subDir = path.dirname(options.srtPath);
    tempSubPath = path.join(subDir, tempSubName);
    fs.copyFileSync(options.srtPath, tempSubPath);

    const escapedPath = tempSubPath!.replace(/:/g, '\\:').replace(/'/g, "'\\''");

    if (isAnimated) {
      captionFilter = `ass='${escapedPath}'`;
    } else {
      const subtitleStyle = CAPTION_STYLE_MAP[options.captionStyle || 'instagram'] || CAPTION_STYLE_MAP.instagram;
      captionFilter = `subtitles='${escapedPath}':force_style='${subtitleStyle}'`;
    }

    logger.debug(`[Combined] Added caption filter for: ${options.srtPath}`);
  }

  // Check if headline is needed
  const hasHeadline = !!options.headline;
  const hasCaptions = !!captionFilter;
  let headlinePngPath: string | null = null;

  // If no filters to apply, just copy the file
  if (!hasHeadline && !hasCaptions) {
    logger.debug('[Combined] No filters to apply, copying file');
    fs.copyFileSync(inputPath, outputPath);
    return outputPath;
  }

  const processConfig: FFmpegProcessConfig = {
    timeout: 5 * 60 * 1000,
    maxRetries: 1,
    context: 'Combined Filters',
  };

  try {
    if (hasHeadline) {
      // Headline present: use PNG overlay via filter_complex + runFFmpegSpawn
      const processDir = path.dirname(outputPath);
      const headlineStyle = options.headlineStyle || 'speech-bubble';
      const position = options.headlinePosition || 'top';

      const baseYPositions: Record<string, number> = {
        top: 350,
        center: 860,
        bottom: 1350,
      };

      const { pngPath, imageHeight } = await generateHeadlinePNG(
        options.headline!, headlineStyle, processDir, 1080,
        options.accentWords || [], options.accentColor || '#e85d26'
      );
      headlinePngPath = pngPath;

      const baseY = baseYPositions[position];
      const overlayY = Math.max(0, baseY - Math.floor(imageHeight / 2));

      // Build filter_complex chain
      const filterParts: string[] = [];

      if (hasCaptions) {
        // Captions + Headline: apply captions first, then overlay headline PNG
        filterParts.push(`[0:v]${captionFilter}[captioned]`);
        filterParts.push(`[1:v]format=rgba,fade=t=out:st=4.5:d=0.5:alpha=1[hl]`);
        filterParts.push(`[captioned][hl]overlay=x=(W-w)/2:y=${overlayY}:eof_action=pass[out]`);
      } else {
        // Headline only
        filterParts.push(`[1:v]format=rgba,fade=t=out:st=4.5:d=0.5:alpha=1[hl]`);
        filterParts.push(`[0:v][hl]overlay=x=(W-w)/2:y=${overlayY}:eof_action=pass[out]`);
      }

      const filterComplex = filterParts.join(';');
      logger.debug(`[Combined] Applying ${hasCaptions ? 'captions + ' : ''}headline overlay in single pass`);

      const args = [
        '-y',
        '-i', inputPath,
        '-loop', '1', '-t', '5', '-i', pngPath,
        '-filter_complex', filterComplex,
        '-map', '[out]',
        '-map', '0:a?',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', naturalCrf(),
        '-pix_fmt', 'yuv420p',
        '-threads', '0',
        '-max_muxing_queue_size', '512',
        '-bufsize', '1M',
        '-c:a', 'copy',
        '-movflags', '+faststart',
        ...creationTimestamp(),
        '-shortest',
        outputPath
      ];

      await runFFmpegSpawn(args, processConfig);
    } else {
      // Captions only (no headline): use existing videoFilters approach
      logger.debug(`[Combined] Applying caption filter in single pass`);

      await runFFmpegWithRetry(() => {
        return ffmpeg(inputPath)
          .videoFilters(captionFilter!)
          .outputOptions([
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', naturalCrf(),
            '-pix_fmt', 'yuv420p',
            '-threads', '0',
            '-max_muxing_queue_size', '512',
            '-bufsize', '1M',
            '-c:a', 'copy',
            '-movflags', '+faststart',
            ...creationTimestamp(),
          ])
          .output(outputPath);
      }, processConfig);
    }

    logger.debug(`[Combined] Processing complete!`);
    return outputPath;
  } catch (err) {
    if (err instanceof FFmpegProcessError && err.isMemoryKill) {
      throw new Error('Combined filter processing failed due to memory constraints.');
    }
    logger.error(`[Combined] Error:`, err instanceof Error ? err : new Error(String(err)));
    throw err;
  } finally {
    // Clean up temp headline PNG
    if (headlinePngPath) {
      try { fs.unlinkSync(headlinePngPath); } catch { /* ignore */ }
    }
    // Clean up temp subtitle file
    if (tempSubPath) {
      try { fs.unlinkSync(tempSubPath); } catch { /* ignore */ }
    }
  }
}

/**
 * Trim video to specified start and end times
 */
export async function trimVideo(
  inputPath: string,
  outputPath: string,
  startTime: number,
  endTime: number
): Promise<string> {
  const duration = endTime - startTime;

  logger.debug(`[Trim] Trimming video from ${startTime.toFixed(2)}s to ${endTime.toFixed(2)}s (duration: ${duration.toFixed(2)}s)`);

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .setStartTime(startTime)
      .setDuration(duration)
      .outputOptions([
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', naturalCrf(),
        '-pix_fmt', 'yuv420p',
        '-threads', '0',
        '-max_muxing_queue_size', '512',
        '-bufsize', '1M',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-avoid_negative_ts', 'make_zero',
        '-movflags', '+faststart',
        ...creationTimestamp(),
      ])
      .output(outputPath)
      .on('end', () => {
        logger.debug(`[Trim] Complete!`);
        resolve(outputPath);
      })
      .on('error', (err: Error) => {
        logger.error(`[Trim] Error:`, err);
        reject(err);
      })
      .run();
  });
}

export interface SplitSegment {
  startTime: number;
  endTime: number;
  outputPath: string;
}

/**
 * Split video into multiple segments at specified timestamps
 */
export async function splitVideo(
  inputPath: string,
  outputDir: string,
  splitPoints: number[],
  baseFilename: string
): Promise<string[]> {
  // Get video duration
  const duration = await getVideoDuration(inputPath);

  // Create segments from split points
  const allPoints = [0, ...splitPoints.sort((a, b) => a - b), duration];
  const segments: SplitSegment[] = [];

  for (let i = 0; i < allPoints.length - 1; i++) {
    const startTime = allPoints[i];
    const endTime = allPoints[i + 1];
    const outputPath = path.join(outputDir, `${baseFilename}_part${i + 1}.mp4`);
    segments.push({ startTime, endTime, outputPath });
  }

  logger.debug(`[Split] Splitting video into ${segments.length} parts`);

  const outputPaths: string[] = [];

  for (const segment of segments) {
    const segmentDuration = segment.endTime - segment.startTime;
    logger.debug(`[Split] Creating part: ${segment.startTime.toFixed(2)}s - ${segment.endTime.toFixed(2)}s`);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .setStartTime(segment.startTime)
        .setDuration(segmentDuration)
        .outputOptions([
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', naturalCrf(),
          '-pix_fmt', 'yuv420p',
          '-threads', '0',
          '-max_muxing_queue_size', '512',
          '-bufsize', '1M',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-avoid_negative_ts', 'make_zero',
          '-movflags', '+faststart',
          ...creationTimestamp(),
        ])
        .output(segment.outputPath)
        .on('end', () => {
          logger.debug(`[Split] Part created: ${segment.outputPath}`);
          outputPaths.push(segment.outputPath);
          resolve();
        })
        .on('error', (err: Error) => {
          logger.error(`[Split] Error:`, err);
          reject(err);
        })
        .run();
    });
  }

  logger.debug(`[Split] Complete! Created ${outputPaths.length} parts`);
  return outputPaths;
}

