import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs, { existsSync } from 'fs';
import { spawn } from 'child_process';
import { logger } from './logger';
import { runFFmpegCommand, runFFmpegWithRetry, runFFmpegSpawn, FFmpegProcessError, FFmpegProcessConfig, getMemoryEfficientOptions } from './ffmpegProcess';

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
import { generateContextualAnimation, selectAnimationFromContext, generateAnimation } from './sharp-animations';

export interface SilenceInterval {
  start: number;
  end: number;
}

export type HeadlineStyle = 'classic' | 'speech-bubble';

export interface ProcessingOptions {
  silenceThreshold?: number; // in dB, default -30
  silenceDuration?: number; // minimum silence duration in seconds, default 0.3 (aggressive)
  autoSilenceThreshold?: boolean; // auto-detect optimal threshold based on audio noise floor
  headline?: string;
  headlinePosition?: 'top' | 'center' | 'bottom';
  headlineStyle?: HeadlineStyle;
  captionStyle?: 'instagram';
}

/**
 * Analyze a single chunk of audio and return volume statistics
 *
 * NOISE-AWARE: Uses speech-band filtering to focus on voice frequencies
 * This gives more accurate volume stats by ignoring background noise
 */
async function analyzeAudioChunk(
  inputPath: string,
  startTime: number,
  duration: number
): Promise<{ maxVolume: number; meanVolume: number } | null> {
  return new Promise((resolve) => {
    let statsOutput = '';

    // Apply speech-band filter before volume detection
    // This focuses analysis on voice frequencies (200Hz-3500Hz)
    const command = ffmpeg(inputPath)
      .inputOptions(['-ss', String(startTime), '-t', String(duration)])
      .audioFilters('highpass=f=200,lowpass=f=3500,volumedetect')
      .format('null')
      .output('/dev/null');

    command
      .on('stderr', (line: string) => {
        statsOutput += line + '\n';
      })
      .on('end', () => {
        const meanMatch = statsOutput.match(/mean_volume:\s*(-?[\d.]+)\s*dB/i);
        const maxMatch = statsOutput.match(/max_volume:\s*(-?[\d.]+)\s*dB/i);

        if (!maxMatch) {
          resolve(null);
          return;
        }

        resolve({
          maxVolume: parseFloat(maxMatch[1]),
          meanVolume: meanMatch ? parseFloat(meanMatch[1]) : parseFloat(maxMatch[1]) - 15,
        });
      })
      .on('error', () => {
        resolve(null);
      })
      .run();
  });
}

/**
 * Phase 1: Full-video audio analysis in chunks
 * Analyzes the entire video in chunks and uses the median of max volumes
 * to be robust against outliers and varying audio levels throughout the video.
 */
async function analyzeFullVideoAudio(
  inputPath: string,
  videoDuration: number,
  chunkDuration: number = 30
): Promise<{ maxVolumes: number[]; meanVolumes: number[]; medianMax: number; medianMean: number }> {
  // Guard against invalid duration values
  if (!Number.isFinite(videoDuration) || videoDuration <= 0) {
    logger.warn('[Audio Analysis] Invalid video duration, using default values', { videoDuration });
    return { maxVolumes: [], meanVolumes: [], medianMax: -25, medianMean: -30 };
  }

  const numChunks = Math.ceil(videoDuration / chunkDuration);
  const maxVolumes: number[] = [];
  const meanVolumes: number[] = [];

  logger.debug(`[Audio Analysis] Analyzing full video in ${numChunks} chunks of ${chunkDuration}s each`);

  // Analyze chunks in parallel (up to 3 at a time to avoid overwhelming the system)
  const chunkPromises: Promise<void>[] = [];

  for (let i = 0; i < numChunks; i++) {
    const startTime = i * chunkDuration;
    const actualDuration = Math.min(chunkDuration, videoDuration - startTime);

    if (actualDuration < 1) continue; // Skip very short final chunks

    chunkPromises.push(
      analyzeAudioChunk(inputPath, startTime, actualDuration).then((result) => {
        if (result) {
          maxVolumes.push(result.maxVolume);
          meanVolumes.push(result.meanVolume);
        }
      })
    );

    // Process in batches of 3 to limit concurrent FFmpeg processes
    if (chunkPromises.length >= 3 || i === numChunks - 1) {
      await Promise.all(chunkPromises);
      chunkPromises.length = 0;
    }
  }

  // Calculate medians (robust to outliers)
  const sortedMax = [...maxVolumes].sort((a, b) => a - b);
  const sortedMean = [...meanVolumes].sort((a, b) => a - b);

  const medianMax = sortedMax.length > 0
    ? sortedMax[Math.floor(sortedMax.length / 2)]
    : -20;
  const medianMean = sortedMean.length > 0
    ? sortedMean[Math.floor(sortedMean.length / 2)]
    : -35;

  logger.debug(`[Audio Analysis] Chunk analysis complete: ${maxVolumes.length} chunks analyzed`);
  logger.debug(`[Audio Analysis] Max volumes range: ${Math.min(...maxVolumes).toFixed(1)} to ${Math.max(...maxVolumes).toFixed(1)} dB`);
  logger.debug(`[Audio Analysis] Median max: ${medianMax.toFixed(1)} dB, Median mean: ${medianMean.toFixed(1)} dB`);

  return { maxVolumes, meanVolumes, medianMax, medianMean };
}

/**
 * Phase 3: Percentile-based threshold calculation using astats
 * Uses FFmpeg astats to get more detailed audio statistics including RMS levels
 * This is more robust than simple max/mean as it considers the distribution of audio levels
 *
 * NOISE-AWARE: Uses speech-band filtering to focus analysis on voice frequencies
 */
async function analyzeAudioPercentiles(
  inputPath: string,
  sampleDuration?: number
): Promise<{ peakLevel: number; rmsLevel: number; dynamicRange: number } | null> {
  return new Promise((resolve) => {
    let statsOutput = '';

    const inputOptions = sampleDuration ? ['-t', String(sampleDuration)] : [];

    // Apply speech-band filter before astats analysis
    // This focuses on voice frequencies (200Hz-3500Hz) and rejects background noise
    const command = ffmpeg(inputPath)
      .inputOptions(inputOptions)
      .audioFilters('highpass=f=200,lowpass=f=3500,astats=measure_perchannel=Peak_level+RMS_level:measure_overall=Peak_level+RMS_level')
      .format('null')
      .output('/dev/null');

    command
      .on('stderr', (line: string) => {
        statsOutput += line + '\n';
      })
      .on('end', () => {
        // Parse astats output - look for Overall statistics
        // Format: [Parsed_astats_0 @ ...] Overall
        // Peak level dB: -X.XX
        // RMS level dB: -X.XX
        const peakMatch = statsOutput.match(/Peak level dB:\s*(-?[\d.]+)/i);
        const rmsMatch = statsOutput.match(/RMS level dB:\s*(-?[\d.]+)/i);

        if (!peakMatch || !rmsMatch) {
          logger.debug(`[Audio Percentiles] Could not parse astats output`);
          resolve(null);
          return;
        }

        const peakLevel = parseFloat(peakMatch[1]);
        const rmsLevel = parseFloat(rmsMatch[1]);
        const dynamicRange = peakLevel - rmsLevel;

        logger.debug(`[Audio Percentiles] Peak: ${peakLevel.toFixed(1)} dB, RMS: ${rmsLevel.toFixed(1)} dB, Dynamic range: ${dynamicRange.toFixed(1)} dB`);

        resolve({ peakLevel, rmsLevel, dynamicRange });
      })
      .on('error', (err: Error) => {
        logger.debug(`[Audio Percentiles] Error: ${err.message}`);
        resolve(null);
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
  // For noisy audio: use smaller offset (8dB) since speech-noise gap is small
  // For clean audio: use 10dB offset
  const peakOffset = isNoisyAudio ? 8 : (isModerateNoise ? 9 : 10);
  const traditionalThreshold = medianMax - peakOffset;
  thresholds.push(traditionalThreshold);
  // Higher weight for noisy audio since mean/RMS are less reliable
  weights.push(isNoisyAudio ? 1.5 : 1.0);

  // Method 2: Mean-based threshold (less reliable for noisy audio)
  // AGGRESSIVE: Reduced from 5 to 2dB - tighter around mean level
  const meanBasedThreshold = medianMean - 2;
  thresholds.push(meanBasedThreshold);
  // Lower weight for noisy audio since mean is elevated by noise
  weights.push(isNoisyAudio ? 0.2 : 0.5);

  // Method 3: If we have astats data, use RMS-based calculation
  if (rmsLevel !== undefined && dynamicRange !== undefined) {
    // RMS represents the "energy" of the audio, silence should be below RMS
    // For noisy audio: RMS is elevated, use smaller offset
    const rmsOffset = isNoisyAudio ? 2 : 4;
    const rmsBasedThreshold = rmsLevel - rmsOffset;
    thresholds.push(rmsBasedThreshold);
    // Lower weight for noisy audio
    weights.push(isNoisyAudio ? 0.3 : 0.8);

    // If dynamic range is large, we can be more aggressive
    if (dynamicRange > 15) {
      // High dynamic range = clear distinction between speech and silence
      // AGGRESSIVE: Use 12dB offset for aggressive silence cutting
      const aggressiveThreshold = medianMax - 12;
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

  // AGGRESSIVE: Clamp to bounds (-50 to -12 dB) - raised upper limit from -15 to -12
  // For noisy audio, allow even higher threshold (up to -10dB)
  const upperLimit = isNoisyAudio ? -10 : -12;
  threshold = Math.min(upperLimit, Math.max(-50, threshold));

  // Enhanced logging for debugging
  const gapFromMax = medianMax - threshold;
  const noiseStatus = isNoisyAudio ? ' [NOISY AUDIO]' : (isModerateNoise ? ' [MODERATE NOISE]' : '');
  logger.info(`[Adaptive Threshold] Input: medianMax=${medianMax.toFixed(1)}dB, medianMean=${medianMean.toFixed(1)}dB${rmsLevel !== undefined ? `, rms=${rmsLevel.toFixed(1)}dB` : ''}${dynamicRange !== undefined ? `, dynamicRange=${dynamicRange.toFixed(1)}dB` : ''}${noiseStatus}`);
  logger.info(`[Adaptive Threshold] Methods: ${thresholds.map((t, i) => `${t.toFixed(1)}dB(w=${weights[i]})`).join(', ')}`);
  logger.info(`[Adaptive Threshold] Result: ${threshold.toFixed(1)}dB (${gapFromMax.toFixed(1)}dB below peak) [AGGRESSIVE MODE]${noiseStatus}`);

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
  if (primarySilencePercent < 40 && sensitiveSilencePercent > primarySilencePercent * 1.15) {
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

  // Phase 1: Full-video analysis
  const chunkDuration = Math.min(30, videoDuration); // Use smaller chunks for short videos
  const { medianMax, medianMean } = await analyzeFullVideoAudio(inputPath, videoDuration, chunkDuration);

  // Phase 3: Percentile-based analysis (sample first 60s or full video if shorter)
  const sampleForPercentiles = Math.min(60, videoDuration);
  const percentileData = await analyzeAudioPercentiles(inputPath, sampleForPercentiles);

  // Calculate adaptive threshold
  const adaptiveThreshold = calculateAdaptiveThreshold(
    medianMax,
    medianMean,
    percentileData?.peakLevel,
    percentileData?.rmsLevel,
    percentileData?.dynamicRange
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

  const analysisInfo = `Adaptive detection: medianMax=${medianMax.toFixed(1)}dB, threshold=${threshold.toFixed(1)}dB${wasAdjusted ? ' (adjusted)' : ''}, ${silences.length} silences (${silencePercent.toFixed(1)}%)`;

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
 * NOISE-AWARE: Uses speech-band filtering (200Hz-3500Hz) to focus on voice frequencies
 * and ignore background noise (low rumble, high hiss) that can interfere with detection
 */
export async function detectSilence(
  inputPath: string,
  threshold: number = -20,
  minDuration: number = 0.3,  // AGGRESSIVE: Reduced from 0.5 to catch shorter silences
  useSpeechBandFilter: boolean = true  // Filter to speech frequencies for noise rejection
): Promise<SilenceInterval[]> {
  return new Promise((resolve, reject) => {
    const silences: SilenceInterval[] = [];
    let currentSilenceStart: number | null = null;

    // Build audio filter chain
    // Speech band: 200Hz - 3500Hz covers fundamental frequencies and harmonics of human voice
    // This helps reject:
    // - Low frequency rumble (AC hum, traffic, HVAC) below 200Hz
    // - High frequency hiss (electronics, wind) above 3500Hz
    const speechBandFilter = useSpeechBandFilter
      ? 'highpass=f=200,lowpass=f=3500,'
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
  options: { padding?: number; minSegmentDuration?: number; mergeGap?: number; timebackPadding?: number } = {}
): SilenceInterval[] {
  // Balanced padding: aggressive detection but natural-sounding cuts
  const padding = options.padding ?? 0.015; // 15ms trim into speech edges (minimal, detector boundaries are accurate)
  const minSegmentDuration = options.minSegmentDuration ?? 0.1; // Ignore segments shorter than 100ms
  const mergeGap = options.mergeGap ?? 0.075; // Merge segments less than 75ms apart (reduces choppiness)
  const timebackPadding = options.timebackPadding ?? 0.15; // 150ms breathing room before speech
  const timebackPaddingEnd = 0.25; // 250ms after speech — speech trails off naturally, needs more room

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
 * Remove silent parts from video by concatenating non-silent segments
 * Uses adaptive silence detection when autoSilenceThreshold is enabled
 */
export async function removeSilence(
  inputPath: string,
  outputPath: string,
  options: ProcessingOptions = {}
): Promise<string> {
  let threshold = options.silenceThreshold ?? -20;
  const minDuration = options.silenceDuration ?? 0.3;  // AGGRESSIVE: Reduced from 0.5
  let silences: SilenceInterval[];
  let duration: number;

  // Use adaptive detection when auto-detection is enabled (more robust)
  if (options.autoSilenceThreshold) {
    logger.info(`[Silence Removal] Using adaptive silence detection...`);
    const adaptiveResult = await detectSilenceAdaptive(inputPath, minDuration);
    silences = adaptiveResult.silences;
    threshold = adaptiveResult.threshold;
    duration = await getVideoDuration(inputPath);
    logger.info(`[Silence Removal] ${adaptiveResult.analysisInfo}`);
  } else {
    // Manual threshold mode - use legacy detection
    silences = await detectSilence(inputPath, threshold, minDuration);
    duration = await getVideoDuration(inputPath);
  }

  logger.debug(`[Silence Removal] Video duration: ${duration.toFixed(2)}s`);
  logger.debug(`[Silence Removal] Found ${silences.length} silent intervals`);

  const segments = getNonSilentSegments(silences, duration);

  logger.debug(`[Silence Removal] Non-silent segments to keep: ${segments.length}`);

  // If no silences found or no non-silent segments detected, copy the original file
  // This handles cases where the audio is too quiet or the threshold is too aggressive
  if (silences.length === 0 || segments.length === 0) {
    if (segments.length === 0) {
      logger.debug(`[Silence Removal] No non-silent segments found (audio may be too quiet for threshold ${threshold}dB), copying original file`);
    } else {
      logger.debug(`[Silence Removal] No silences found, copying original file`);
    }
    fs.copyFileSync(inputPath, outputPath);
    return outputPath;
  }

  // Create filter complex for concatenating segments
  const filterParts: string[] = [];
  const concatInputs: string[] = [];

  segments.forEach((segment, index) => {
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
    `${concatInputs.join('')}concat=n=${segments.length}:v=1:a=1[outv][outa]`,
  ].join(';');

  logger.debug(`[Silence Removal] Processing ${segments.length} segments...`);

  // Use retry wrapper for resilience against SIGKILL/memory issues
  const processConfig: FFmpegProcessConfig = {
    timeout: 5 * 60 * 1000, // 5 minutes timeout
    maxRetries: 1, // Retry once on transient failures
    context: 'Silence Removal',
  };

  try {
    await runFFmpegWithRetry(() => {
      return ffmpeg(inputPath)
        .complexFilter(filterComplex)
        .outputOptions([
          '-map', '[outv]',
          '-map', '[outa]',
          // Memory-efficient settings for constrained server environments
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '28',
          '-threads', '2',  // Limit threads to reduce memory pressure
          '-max_muxing_queue_size', '512',  // Limit muxing buffer
          '-bufsize', '1M',  // Limit rate control buffer
          '-c:a', 'aac',
          '-b:a', '128k',
        ])
        .output(outputPath);
    }, processConfig);

    logger.debug(`[Silence Removal] Complete!`);
    return outputPath;
  } catch (err) {
    // Provide more helpful error messages for common failures
    if (err instanceof FFmpegProcessError) {
      if (err.isMemoryKill) {
        logger.error(`[Silence Removal] Process killed due to memory constraints. Video may be too long or complex.`);
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
 * Burn captions (subtitles) into video
 */
export async function burnCaptions(
  inputPath: string,
  outputPath: string,
  srtPath: string,
  style: string = 'default'
): Promise<string> {
  // Check if this is an animated ASS file
  const isAnimated = style === 'animated' || srtPath.endsWith('.ass');

  // Caption styles optimized for safe zones
  // FFmpeg subtitles filter uses default PlayRes of 384x288 for SRT files
  // All margin values must be scaled to this coordinate system
  // For 1080x1920 (9:16): Target captions in lower third, avoiding buttons and engagement icons
  // Alignment=2 is bottom-center, MarginV is from bottom edge in PlayRes coordinates
  const styleMap: Record<string, string> = {
    // Instagram style - white text on semi-transparent dark background box
    // Clean, modern, refined look with better readability on busy backgrounds
    // MarginV=85 ≈ 30% from bottom (moved up), MarginL=28, MarginR=53 for horizontal padding
    instagram: 'Fontname=Helvetica,FontSize=13,Bold=1,PrimaryColour=&HFFFFFF,BackColour=&H80000000,BorderStyle=4,Outline=0,Shadow=0,Alignment=2,MarginV=85,MarginL=28,MarginR=53',
  };

  logger.debug(`[Captions] Burning captions from: ${srtPath}`);
  logger.debug(`[Captions] Style: ${style}, Animated: ${isAnimated}`);

  // Read and log subtitle content for debugging
  const subContent = fs.readFileSync(srtPath, 'utf-8');
  const lineCount = subContent.split('\n').length;
  logger.debug(`[Captions] Subtitle file has ${lineCount} lines`);

  // Copy subtitle to a temp file with simple name to avoid FFmpeg path escaping issues
  const tempSubName = isAnimated ? 'temp_subs.ass' : 'temp_subs.srt';
  const subDir = path.dirname(srtPath);
  const tempSubPath = path.join(subDir, tempSubName);
  fs.copyFileSync(srtPath, tempSubPath);

  const escapedPath = tempSubPath.replace(/:/g, '\\:').replace(/'/g, "'\\''");

  // For animated ASS files, use the ass filter directly (styles are embedded in the file)
  // For SRT files, use subtitles filter with force_style
  let filterString: string;
  if (isAnimated) {
    filterString = `ass='${escapedPath}'`;
  } else {
    const subtitleStyle = styleMap[style] || styleMap.instagram;
    filterString = `subtitles='${escapedPath}':force_style='${subtitleStyle}'`;
  }
  logger.debug(`[Captions] Filter: ${filterString}`);

  const processConfig: FFmpegProcessConfig = {
    timeout: 5 * 60 * 1000,
    maxRetries: 1,
    context: 'Captions',
  };

  try {
    await runFFmpegWithRetry(() => {
      return ffmpeg(inputPath)
        .videoFilters(filterString)
        .outputOptions([
          // Memory-efficient encoding for constrained server environments
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '28',
          '-threads', '2',
          '-max_muxing_queue_size', '512',
          '-bufsize', '1M',
          '-c:a', 'copy',
        ])
        .output(outputPath);
    }, processConfig);

    logger.debug(`[Captions] Complete!`);
    try { fs.unlinkSync(tempSubPath); } catch {}
    return outputPath;
  } catch (err) {
    try { fs.unlinkSync(tempSubPath); } catch {}

    if (err instanceof FFmpegProcessError && err.isMemoryKill) {
      throw new Error('Caption burning failed due to memory constraints. Try a shorter video.');
    }
    logger.error(`[Captions] Error:`, err instanceof Error ? err : new Error(String(err)));
    throw err;
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
 * Add headline text overlay to video with selectable styling
 * Styles:
 * - 'speech-bubble': White background with rounded corners, black bold text, triangle tail
 * - 'classic': Semi-transparent black background with rounded corners, white bold text
 * Always displays as 2 lines for better visual balance
 * Positioned in safe zone: below top 200px, avoiding right 150px for engagement buttons
 */
export async function addHeadline(
  inputPath: string,
  outputPath: string,
  headline: string,
  position: 'top' | 'center' | 'bottom' = 'top',
  captionStyle: string = 'instagram',
  headlineStyle: HeadlineStyle = 'speech-bubble'
): Promise<string> {
  // Validate input file exists
  if (!fs.existsSync(inputPath)) {
    throw new Error(`[Headline] Input file does not exist: ${inputPath}`);
  }

  // Validate headline is not empty after sanitization
  const sanitizedTest = headline.replace(/[^\x20-\x7E\u00C0-\u00FF]/g, '').trim();
  if (!sanitizedTest) {
    logger.debug(`[Headline] Empty headline after sanitization, copying original file`);
    fs.copyFileSync(inputPath, outputPath);
    return outputPath;
  }

  // Y positions optimized for safe zones (1080x1920)
  const baseYPositions: Record<string, number> = {
    top: 350,
    center: 860,  // Approximate center for 1920 height
    bottom: 1350,
  };

  // Sanitize and escape special characters for FFmpeg drawtext filter
  const escapedHeadline = headline
    .replace(/[^\x20-\x7E\u00C0-\u00FF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\\/g, '\\\\')
    .replace(/'/g, '')
    .replace(/"/g, '')
    .replace(/%/g, '%%')
    .replace(/;/g, '\\;')
    .replace(/:/g, '\\:');

  // Always split into 2 lines for visual balance
  const [line1, line2] = splitHeadlineIntoTwoLines(escapedHeadline);
  const hasSecondLine = line2.length > 0;

  // Smooth fade-in (0-0.5s) and fade-out (4.5-5s)
  const alphaExpr = "alpha='if(lt(t\\,0.5)\\,t*2\\,if(gt(t\\,4.5)\\,(5-t)*2\\,1))'";

  const baseY = baseYPositions[position];
  const fontSize = 54;
  const lineHeight = 70;
  const boxPadding = 15;  // Padding around text in the auto-sized box

  let filterString: string;

  if (headlineStyle === 'speech-bubble') {
    // Speech bubble style: white background box (auto-sized), black bold text
    const textColor = 'black';
    const boxColor = 'white@0.98';

    // Line 1 text with auto-sized background box
    const line1Filter = `drawtext=text='${line1}':fontsize=${fontSize}:fontcolor=${textColor}:x=(w-text_w)/2:y=${baseY}:box=1:boxcolor=${boxColor}:boxborderw=${boxPadding}:${alphaExpr}:enable='between(t,0,5)'`;
    // Bold overlay (no box, just text slightly offset)
    const line1BoldFilter = `drawtext=text='${line1}':fontsize=${fontSize}:fontcolor=${textColor}:x=(w-text_w)/2+1:y=${baseY}:${alphaExpr}:enable='between(t,0,5)'`;

    // Line 2 text (if exists)
    const line2Y = baseY + lineHeight;
    const line2Filter = hasSecondLine
      ? `drawtext=text='${line2}':fontsize=${fontSize}:fontcolor=${textColor}:x=(w-text_w)/2:y=${line2Y}:box=1:boxcolor=${boxColor}:boxborderw=${boxPadding}:${alphaExpr}:enable='between(t,0,5)'`
      : '';
    const line2BoldFilter = hasSecondLine
      ? `drawtext=text='${line2}':fontsize=${fontSize}:fontcolor=${textColor}:x=(w-text_w)/2+1:y=${line2Y}:${alphaExpr}:enable='between(t,0,5)'`
      : '';

    const filters = [line1Filter, line1BoldFilter];
    if (hasSecondLine) {
      filters.push(line2Filter, line2BoldFilter);
    }
    filterString = filters.join(',');

  } else {
    // Classic style: semi-transparent dark background box (auto-sized), white bold text
    const boxColor = 'black@0.7';

    // Line 1 text with auto-sized background box and shadow
    const line1Filter = `drawtext=text='${line1}':fontsize=${fontSize}:fontcolor=white:x=(w-text_w)/2:y=${baseY}:box=1:boxcolor=${boxColor}:boxborderw=${boxPadding}:${alphaExpr}:shadowcolor=black@0.9:shadowx=2:shadowy=2:enable='between(t,0,5)'`;
    const line1BoldFilter = `drawtext=text='${line1}':fontsize=${fontSize}:fontcolor=white:x=(w-text_w)/2+1:y=${baseY}:${alphaExpr}:enable='between(t,0,5)'`;

    // Line 2 text (if exists)
    const line2Y = baseY + lineHeight;
    const line2Filter = hasSecondLine
      ? `drawtext=text='${line2}':fontsize=${fontSize}:fontcolor=white:x=(w-text_w)/2:y=${line2Y}:box=1:boxcolor=${boxColor}:boxborderw=${boxPadding}:${alphaExpr}:shadowcolor=black@0.9:shadowx=2:shadowy=2:enable='between(t,0,5)'`
      : '';
    const line2BoldFilter = hasSecondLine
      ? `drawtext=text='${line2}':fontsize=${fontSize}:fontcolor=white:x=(w-text_w)/2+1:y=${line2Y}:${alphaExpr}:enable='between(t,0,5)'`
      : '';

    const filters = [line1Filter, line1BoldFilter];
    if (hasSecondLine) {
      filters.push(line2Filter, line2BoldFilter);
    }
    filterString = filters.join(',');
  }

  logger.debug(`[Headline] Adding 2-line headline: "${line1}" / "${line2}" at ${position} (${headlineStyle})`);

  const processConfig: FFmpegProcessConfig = {
    timeout: 3 * 60 * 1000, // 3 minutes should be enough for headline
    maxRetries: 1,
    context: 'Headline',
  };

  try {
    await runFFmpegWithRetry(() => {
      return ffmpeg(inputPath)
        .videoFilters(filterString)
        .outputOptions([
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '28',
          '-threads', '2',
          '-max_muxing_queue_size', '512',
          '-bufsize', '1M',
          '-c:a', 'copy',
        ])
        .output(outputPath);
    }, processConfig);

    logger.debug(`[Headline] Complete!`);
    return outputPath;
  } catch (err) {
    if (err instanceof FFmpegProcessError && err.isMemoryKill) {
      throw new Error('Headline rendering failed due to memory constraints.');
    }
    logger.error(`[Headline] Error:`, err instanceof Error ? err : new Error(String(err)));
    throw err;
  }
}

export interface BRollCutaway {
  timestamp: number;
  duration: number;
  context: string;  // Context text used to generate contextual animation
}

/**
 * Convert an image to a video clip with subtle ken burns effect
 */
export async function imageToVideoClip(
  imagePath: string,
  outputPath: string,
  duration: number,
  videoWidth: number = 1080,
  videoHeight: number = 1920
): Promise<string> {
  logger.debug(`[B-Roll] Converting image to ${duration}s video clip`);

  return new Promise((resolve, reject) => {
    // Ken burns effect: slow zoom in
    const filterComplex = [
      `scale=${videoWidth * 1.1}:${videoHeight * 1.1}`,
      `zoompan=z='min(zoom+0.001,1.1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${duration * 30}:s=${videoWidth}x${videoHeight}:fps=30`
    ].join(',');

    ffmpeg(imagePath)
      .loop(1)
      .inputOptions(['-t', String(duration)])
      .videoFilters(filterComplex)
      .outputOptions([
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-threads', '0',
        '-t', String(duration),
        '-pix_fmt', 'yuv420p',
        '-r', '30',
        '-max_muxing_queue_size', '512',
      ])
      .output(outputPath)
      .on('end', () => {
        logger.debug(`[B-Roll] Video clip created: ${outputPath}`);
        resolve(outputPath);
      })
      .on('error', (err: Error) => {
        logger.error(`[B-Roll] Error creating clip:`, err);
        reject(err);
      })
      .run();
  });
}

/**
 * Insert B-roll animation overlays using sharp-generated animations
 * Creates smooth, professional animations overlaid on the video
 */
export async function insertBRollCutaways(
  inputPath: string,
  outputPath: string,
  cutaways: BRollCutaway[],
  outputDir: string,
  style: 'minimal' | 'dynamic' | 'data-focused' = 'dynamic'
): Promise<string> {
  if (cutaways.length === 0) {
    fs.copyFileSync(inputPath, outputPath);
    return outputPath;
  }

  logger.debug(`[B-Roll] Adding ${cutaways.length} animation overlays (style: ${style})`);

  // Get video dimensions
  const metadata = await safeFFprobe(inputPath);
  const videoStream = metadata.streams.find(s => s.codec_type === 'video');
  const videoInfo = {
    width: videoStream?.width || 1080,
    height: videoStream?.height || 1920,
    duration: metadata.format.duration || 60,
  };

  // Animation box dimensions (centered, 70% width, 35% height)
  const animWidth = Math.floor(videoInfo.width * 0.7);
  const animHeight = Math.floor(videoInfo.height * 0.35);
  const animX = Math.floor((videoInfo.width - animWidth) / 2);
  const animY = Math.floor((videoInfo.height - animHeight) / 2);

  // Sort cutaways by timestamp
  const sortedCutaways = [...cutaways].sort((a, b) => a.timestamp - b.timestamp);

  // Generate animation videos for each cutaway
  const animationPaths: string[] = [];
  const animationInfos: { path: string; start: number; duration: number }[] = [];

  for (let i = 0; i < sortedCutaways.length; i++) {
    const cutaway = sortedCutaways[i];
    const animPath = path.join(outputDir, `broll_anim_${i}_${Date.now()}.mp4`);

    try {
      await generateContextualAnimation(
        animPath,
        cutaway.duration,
        animWidth,
        animHeight,
        cutaway.context,
        style
      );
      animationPaths.push(animPath);
      animationInfos.push({
        path: animPath,
        start: cutaway.timestamp,
        duration: cutaway.duration
      });
      logger.debug(`[B-Roll] Generated animation ${i + 1}/${sortedCutaways.length} for: "${cutaway.context.slice(0, 40)}..."`);
    } catch (err) {
      logger.error(`[B-Roll] Failed to generate animation for cutaway ${i}:`, err as Error);
      // Continue with other cutaways
    }
  }

  if (animationInfos.length === 0) {
    logger.debug(`[B-Roll] No animations generated, copying original`);
    fs.copyFileSync(inputPath, outputPath);
    return outputPath;
  }

  // Build FFmpeg command with overlay filter for each animation
  try {
    let currentInput = inputPath;
    let stepIndex = 0;

    for (const anim of animationInfos) {
      const stepOutput = path.join(outputDir, `broll_step_${stepIndex}_${Date.now()}.mp4`);

      await overlayAnimationOnVideo(
        currentInput,
        anim.path,
        stepOutput,
        animX,
        animY,
        anim.start,
        anim.duration
      );

      // Cleanup previous step if not the original
      if (currentInput !== inputPath && fs.existsSync(currentInput)) {
        try { fs.unlinkSync(currentInput); } catch (e) { /* ignore */ }
      }

      currentInput = stepOutput;
      stepIndex++;
    }

    // Move final result to output path
    if (currentInput !== outputPath) {
      fs.renameSync(currentInput, outputPath);
    }

    logger.debug(`[B-Roll] All animation overlays added successfully`);
  } finally {
    // Cleanup animation files
    for (const animPath of animationPaths) {
      try { if (fs.existsSync(animPath)) fs.unlinkSync(animPath); } catch (e) { /* ignore */ }
    }
  }

  return outputPath;
}

/**
 * Overlay a single animation video onto the main video at specified position and time
 */
async function overlayAnimationOnVideo(
  mainVideo: string,
  animationVideo: string,
  outputPath: string,
  x: number,
  y: number,
  startTime: number,
  duration: number
): Promise<void> {
  // Use filter_complex to overlay animation with fade in/out
  const fadeIn = 0.3;
  const fadeOut = 0.3;
  const endTime = startTime + duration;

  // Filter: overlay animation on main video with time-based enable and fade
  const filterComplex = [
    // Scale animation if needed and add fade
    `[1:v]fade=t=in:st=0:d=${fadeIn},fade=t=out:st=${duration - fadeOut}:d=${fadeOut}[anim]`,
    // Overlay at position with time enable
    `[0:v][anim]overlay=x=${x}:y=${y}:enable='between(t,${startTime},${endTime})'[out]`
  ].join(';');

  const args = [
    '-y',
    '-i', mainVideo,
    '-i', animationVideo,
    '-filter_complex', filterComplex,
    '-map', '[out]',
    '-map', '0:a?',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '28',
    '-threads', '2',
    '-c:a', 'copy',
    '-shortest',
    outputPath
  ];

  logger.debug(`[B-Roll] Overlaying animation at (${x},${y}) from ${startTime}s to ${endTime}s`);

  try {
    await runFFmpegSpawn(args, {
      timeout: 3 * 60 * 1000, // 3 minute timeout
      maxRetries: 1,
      context: 'B-Roll Overlay',
    });
  } catch (err) {
    if (err instanceof FFmpegProcessError) {
      logger.error(`[B-Roll] FFmpeg overlay error: ${err.message}`);
      if (err.isMemoryKill) {
        throw new Error('B-Roll overlay failed due to memory constraints.');
      }
    }
    throw err;
  }
}

/**
 * Normalize audio levels using EBU R128 loudness standard
 * Target: -14 LUFS (optimal for social media platforms)
 */
export async function normalizeAudio(
  inputPath: string,
  outputPath: string
): Promise<string> {
  logger.debug(`[Audio] Normalizing audio levels...`);

  const processConfig: FFmpegProcessConfig = {
    timeout: 3 * 60 * 1000,
    maxRetries: 1,
    context: 'Audio Normalization',
  };

  try {
    await runFFmpegWithRetry(() => {
      return ffmpeg(inputPath)
        .audioFilters('loudnorm=I=-14:TP=-1:LRA=11')
        .outputOptions([
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-b:a', '128k',
        ])
        .output(outputPath);
    }, processConfig);

    logger.debug(`[Audio] Normalization complete!`);
    return outputPath;
  } catch (err) {
    if (err instanceof FFmpegProcessError && err.isMemoryKill) {
      throw new Error('Audio normalization failed due to memory constraints.');
    }
    logger.error(`[Audio] Normalization error:`, err instanceof Error ? err : new Error(String(err)));
    throw err;
  }
}

/**
 * Aspect ratio presets for different platforms
 */
export type AspectRatioPreset = 'original' | '9:16' | '16:9' | '1:1' | '4:5';

export interface AspectRatioInfo {
  name: string;
  ratio: number; // width/height
  platforms: string[];
}

export const ASPECT_RATIOS: Record<AspectRatioPreset, AspectRatioInfo> = {
  'original': { name: 'Original', ratio: 0, platforms: ['Keep original'] },
  '9:16': { name: 'Vertical', ratio: 9/16, platforms: ['Reels', 'Shorts'] },
  '16:9': { name: 'Landscape', ratio: 16/9, platforms: ['YouTube', 'Twitter'] },
  '1:1': { name: 'Square', ratio: 1, platforms: ['Instagram Feed'] },
  '4:5': { name: 'Portrait', ratio: 4/5, platforms: ['Instagram', 'Facebook'] },
};

/**
 * Convert video to a different aspect ratio using blur background padding
 * This preserves all content by adding blurred edges instead of cropping
 */
export async function convertAspectRatio(
  inputPath: string,
  outputPath: string,
  targetRatio: AspectRatioPreset
): Promise<string> {
  if (targetRatio === 'original') {
    logger.debug(`[Aspect] Keeping original aspect ratio`);
    fs.copyFileSync(inputPath, outputPath);
    return outputPath;
  }

  // Get video dimensions
  const aspectMetadata = await safeFFprobe(inputPath);
  const aspectVideoStream = aspectMetadata.streams.find(s => s.codec_type === 'video');
  const videoInfo = {
    width: aspectVideoStream?.width || 1920,
    height: aspectVideoStream?.height || 1080,
  };

  const currentRatio = videoInfo.width / videoInfo.height;
  const targetRatioValue = ASPECT_RATIOS[targetRatio].ratio;

  logger.debug(`[Aspect] Converting from ${currentRatio.toFixed(2)} to ${targetRatioValue.toFixed(2)} (${targetRatio})`);

  // Calculate target dimensions (keep the larger dimension, adjust the other)
  let targetWidth: number;
  let targetHeight: number;

  if (targetRatioValue > currentRatio) {
    // Target is wider - keep height, add width
    targetHeight = videoInfo.height;
    targetWidth = Math.round(targetHeight * targetRatioValue);
  } else {
    // Target is taller - keep width, add height
    targetWidth = videoInfo.width;
    targetHeight = Math.round(targetWidth / targetRatioValue);
  }

  // Ensure dimensions are even (required for most codecs)
  targetWidth = targetWidth + (targetWidth % 2);
  targetHeight = targetHeight + (targetHeight % 2);

  logger.debug(`[Aspect] Original: ${videoInfo.width}x${videoInfo.height}, Target: ${targetWidth}x${targetHeight}`);

  // Build filter for blur background padding
  // This creates a blurred, scaled-up version of the video as background
  // Then overlays the original centered on top
  const filterComplex = [
    // Create blurred background - scale to fill, apply heavy blur
    `[0:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},boxblur=20:5[bg]`,
    // Scale original to fit within target (with letterbox/pillarbox)
    `[0:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease[fg]`,
    // Overlay centered original on blurred background
    `[bg][fg]overlay=(W-w)/2:(H-h)/2[out]`
  ].join(';');

  const processConfig: FFmpegProcessConfig = {
    timeout: 5 * 60 * 1000,
    maxRetries: 1,
    context: 'Aspect Ratio',
  };

  try {
    await runFFmpegWithRetry(() => {
      return ffmpeg(inputPath)
        .complexFilter(filterComplex, 'out')
        .outputOptions([
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '28',
          '-threads', '2',
          '-max_muxing_queue_size', '512',
          '-c:a', 'copy',
        ])
        .output(outputPath);
    }, processConfig);

    logger.debug(`[Aspect] Conversion complete!`);
    return outputPath;
  } catch (err) {
    if (err instanceof FFmpegProcessError && err.isMemoryKill) {
      throw new Error('Aspect ratio conversion failed due to memory constraints.');
    }
    logger.error(`[Aspect] Conversion error:`, err instanceof Error ? err : new Error(String(err)));
    throw err;
  }
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
  const filters: string[] = [];

  // Add caption/subtitle filter if SRT path provided
  if (options.srtPath && fs.existsSync(options.srtPath)) {
    const isAnimated = options.srtPath.endsWith('.ass');

    // Copy subtitle to a temp file with simple name to avoid FFmpeg path escaping issues
    const tempSubName = isAnimated ? 'temp_subs.ass' : 'temp_subs.srt';
    const subDir = path.dirname(options.srtPath);
    const tempSubPath = path.join(subDir, tempSubName);
    fs.copyFileSync(options.srtPath, tempSubPath);

    const escapedPath = tempSubPath.replace(/:/g, '\\:').replace(/'/g, "'\\''");

    if (isAnimated) {
      filters.push(`ass='${escapedPath}'`);
    } else {
      // Instagram style caption
      const subtitleStyle = 'Fontname=Helvetica,FontSize=13,Bold=1,PrimaryColour=&HFFFFFF,BackColour=&H80000000,BorderStyle=4,Outline=0,Shadow=0,Alignment=2,MarginV=85,MarginL=28,MarginR=53';
      filters.push(`subtitles='${escapedPath}':force_style='${subtitleStyle}'`);
    }

    logger.debug(`[Combined] Added caption filter for: ${options.srtPath}`);
  }

  // Add headline filter if specified (with selectable styling)
  if (options.headline) {
    // Y positions optimized for safe zones (1080x1920)
    const baseYPositions: Record<string, number> = {
      top: 350,
      center: 860,
      bottom: 1350,
    };

    // Sanitize and escape special characters for FFmpeg drawtext filter
    const escapedHeadline = options.headline
      .replace(/[^\x20-\x7E\u00C0-\u00FF]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\\/g, '\\\\')
      .replace(/'/g, '')
      .replace(/"/g, '')
      .replace(/%/g, '%%')
      .replace(/;/g, '\\;')
      .replace(/:/g, '\\:');

    const position = options.headlinePosition || 'top';
    const style = options.headlineStyle || 'speech-bubble';
    const alphaExpr = "alpha='if(lt(t\\,0.5)\\,t*2\\,if(gt(t\\,4.5)\\,(5-t)*2\\,1))'";

    // Always split into 2 lines for visual balance
    const [line1, line2] = splitHeadlineIntoTwoLines(escapedHeadline);
    const hasSecondLine = line2.length > 0;

    const baseY = baseYPositions[position];
    const fontSize = 54;
    const lineHeight = 70;
    const boxPadding = 15;  // Padding around text in the auto-sized box

    if (style === 'speech-bubble') {
      // Speech bubble style: white background box (auto-sized), black bold text
      const textColor = 'black';
      const boxColor = 'white@0.98';

      // Line 1 text with auto-sized background box
      filters.push(`drawtext=text='${line1}':fontsize=${fontSize}:fontcolor=${textColor}:x=(w-text_w)/2:y=${baseY}:box=1:boxcolor=${boxColor}:boxborderw=${boxPadding}:${alphaExpr}:enable='between(t,0,5)'`);
      // Bold overlay (no box)
      filters.push(`drawtext=text='${line1}':fontsize=${fontSize}:fontcolor=${textColor}:x=(w-text_w)/2+1:y=${baseY}:${alphaExpr}:enable='between(t,0,5)'`);

      if (hasSecondLine) {
        const line2Y = baseY + lineHeight;
        filters.push(`drawtext=text='${line2}':fontsize=${fontSize}:fontcolor=${textColor}:x=(w-text_w)/2:y=${line2Y}:box=1:boxcolor=${boxColor}:boxborderw=${boxPadding}:${alphaExpr}:enable='between(t,0,5)'`);
        filters.push(`drawtext=text='${line2}':fontsize=${fontSize}:fontcolor=${textColor}:x=(w-text_w)/2+1:y=${line2Y}:${alphaExpr}:enable='between(t,0,5)'`);
      }
    } else {
      // Classic style: semi-transparent dark background box (auto-sized), white bold text
      const boxColor = 'black@0.7';

      // Line 1 text with auto-sized background box and shadow
      filters.push(`drawtext=text='${line1}':fontsize=${fontSize}:fontcolor=white:x=(w-text_w)/2:y=${baseY}:box=1:boxcolor=${boxColor}:boxborderw=${boxPadding}:${alphaExpr}:shadowcolor=black@0.9:shadowx=2:shadowy=2:enable='between(t,0,5)'`);
      filters.push(`drawtext=text='${line1}':fontsize=${fontSize}:fontcolor=white:x=(w-text_w)/2+1:y=${baseY}:${alphaExpr}:enable='between(t,0,5)'`);

      if (hasSecondLine) {
        const line2Y = baseY + lineHeight;
        filters.push(`drawtext=text='${line2}':fontsize=${fontSize}:fontcolor=white:x=(w-text_w)/2:y=${line2Y}:box=1:boxcolor=${boxColor}:boxborderw=${boxPadding}:${alphaExpr}:shadowcolor=black@0.9:shadowx=2:shadowy=2:enable='between(t,0,5)'`);
        filters.push(`drawtext=text='${line2}':fontsize=${fontSize}:fontcolor=white:x=(w-text_w)/2+1:y=${line2Y}:${alphaExpr}:enable='between(t,0,5)'`);
      }
    }
  }

  // If no filters to apply, just copy the file
  if (filters.length === 0) {
    logger.debug('[Combined] No filters to apply, copying file');
    fs.copyFileSync(inputPath, outputPath);
    return outputPath;
  }

  const filterString = filters.join(',');
  logger.debug(`[Combined] Applying ${filters.length} filters in single pass`);

  const processConfig: FFmpegProcessConfig = {
    timeout: 5 * 60 * 1000,
    maxRetries: 1,
    context: 'Combined Filters',
  };

  try {
    await runFFmpegWithRetry(() => {
      return ffmpeg(inputPath)
        .videoFilters(filterString)
        .outputOptions([
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '28',
          '-threads', '2',
          '-max_muxing_queue_size', '512',
          '-bufsize', '1M',
          '-c:a', 'copy',
        ])
        .output(outputPath);
    }, processConfig);

    logger.debug(`[Combined] Processing complete!`);
    return outputPath;
  } catch (err) {
    if (err instanceof FFmpegProcessError && err.isMemoryKill) {
      throw new Error('Combined filter processing failed due to memory constraints.');
    }
    logger.error(`[Combined] Error:`, err instanceof Error ? err : new Error(String(err)));
    throw err;
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
        '-preset', 'ultrafast',
        '-crf', '28',
        '-threads', '0',
        '-max_muxing_queue_size', '512',
        '-bufsize', '1M',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-avoid_negative_ts', 'make_zero',
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
          '-preset', 'ultrafast',
          '-crf', '28',
          '-threads', '0',
          '-max_muxing_queue_size', '512',
          '-bufsize', '1M',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-avoid_negative_ts', 'make_zero',
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

/**
 * Full processing pipeline: remove silence, add captions, add headline
 */
export async function processVideo(
  inputPath: string,
  outputDir: string,
  srtPath?: string,
  options: ProcessingOptions = {}
): Promise<string> {
  const baseName = path.basename(inputPath, path.extname(inputPath));
  let currentInput = inputPath;
  let stepOutput: string;

  // Step 1: Remove silence
  stepOutput = path.join(outputDir, `${baseName}_nosilence.mp4`);
  await removeSilence(currentInput, stepOutput, options);
  currentInput = stepOutput;

  // Step 2: Burn captions if SRT provided
  if (srtPath && fs.existsSync(srtPath)) {
    stepOutput = path.join(outputDir, `${baseName}_captioned.mp4`);
    await burnCaptions(currentInput, stepOutput, srtPath, options.captionStyle);
    // Clean up intermediate file
    if (currentInput !== inputPath) fs.unlinkSync(currentInput);
    currentInput = stepOutput;
  }

  // Step 3: Add headline if provided
  if (options.headline) {
    stepOutput = path.join(outputDir, `${baseName}_final.mp4`);
    await addHeadline(currentInput, stepOutput, options.headline, options.headlinePosition, options.captionStyle);
    // Clean up intermediate file
    if (currentInput !== inputPath) fs.unlinkSync(currentInput);
    currentInput = stepOutput;
  }

  // Rename to final output if needed
  const finalOutput = path.join(outputDir, `${baseName}_processed.mp4`);
  if (currentInput !== finalOutput) {
    fs.renameSync(currentInput, finalOutput);
  }

  return finalOutput;
}
