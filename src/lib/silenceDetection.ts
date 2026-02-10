import ffmpeg from 'fluent-ffmpeg';
import { logger } from './logger';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SilenceInterval {
  start: number;
  end: number;
}

export interface AudioStats {
  maxVolume: number;
  meanVolume: number;
}

export interface PercentileStats {
  peakLevel: number;
  rmsLevel: number;
  dynamicRange: number;
}

export interface ChunkAnalysis {
  maxVolumes: number[];
  meanVolumes: number[];
  medianMax: number;
  medianMean: number;
}

export interface AdaptiveResult {
  silences: SilenceInterval[];
  threshold: number;
  analysisInfo: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Speech frequency band limits for noise rejection */
const SPEECH_BAND = { lowHz: 200, highHz: 3500 } as const;

/** FFmpeg filter string for speech-band isolation */
const SPEECH_BAND_FILTER = `highpass=f=${SPEECH_BAND.lowHz},lowpass=f=${SPEECH_BAND.highHz}`;

/** Dynamic range thresholds for noise classification (in dB) */
const NOISE_THRESHOLDS = {
  veryNoisy: 8,
  noisy: 12,
  moderate: 15,
} as const;

/** Adaptive threshold output bounds (in dB) */
const THRESHOLD_BOUNDS = {
  lower: -50,
  upperVeryNoisy: -6,
  upperNoisy: -8,
  upperClean: -12,
} as const;

/** Default fallback values when analysis fails */
const DEFAULTS = {
  medianMax: -25,
  medianMean: -30,
  noiseFloor: -40,
  threshold: -25,
} as const;

/** Segment padding defaults (in seconds) */
const SEGMENT_DEFAULTS = {
  padding: 0.015,
  minSegmentDuration: 0.1,
  mergeGap: 0.075,
  timebackPaddingStart: 0.15,
  timebackPaddingEnd: 0.2,
} as const;

// ─── Noise Classification ───────────────────────────────────────────────────

type NoiseLevel = 'very_noisy' | 'noisy' | 'moderate' | 'clean';

function classifyNoise(dynamicRange: number | undefined): NoiseLevel {
  if (dynamicRange === undefined) return 'clean';
  if (dynamicRange < NOISE_THRESHOLDS.veryNoisy) return 'very_noisy';
  if (dynamicRange < NOISE_THRESHOLDS.noisy) return 'noisy';
  if (dynamicRange < NOISE_THRESHOLDS.moderate) return 'moderate';
  return 'clean';
}

// ─── Audio Analysis ─────────────────────────────────────────────────────────

/**
 * Analyze a single chunk of audio and return volume statistics.
 * Uses speech-band filtering (200Hz-3500Hz) to focus on voice frequencies.
 */
async function analyzeAudioChunk(
  inputPath: string,
  startTime: number,
  duration: number
): Promise<AudioStats | null> {
  return new Promise((resolve) => {
    let output = '';

    ffmpeg(inputPath)
      .inputOptions(['-ss', String(startTime), '-t', String(duration)])
      .audioFilters(`${SPEECH_BAND_FILTER},volumedetect`)
      .format('null')
      .output('/dev/null')
      .on('stderr', (line: string) => { output += line + '\n'; })
      .on('end', () => {
        const meanMatch = output.match(/mean_volume:\s*(-?[\d.]+)\s*dB/i);
        const maxMatch = output.match(/max_volume:\s*(-?[\d.]+)\s*dB/i);
        if (!maxMatch) { resolve(null); return; }

        resolve({
          maxVolume: parseFloat(maxMatch[1]),
          meanVolume: meanMatch ? parseFloat(meanMatch[1]) : parseFloat(maxMatch[1]) - 15,
        });
      })
      .on('error', () => { resolve(null); })
      .run();
  });
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Phase 1: Analyze full video audio in chunks.
 * Uses the median of max volumes to be robust against outliers.
 */
export async function analyzeFullVideoAudio(
  inputPath: string,
  videoDuration: number,
  chunkDuration: number = 30
): Promise<ChunkAnalysis> {
  if (!Number.isFinite(videoDuration) || videoDuration <= 0) {
    logger.warn('[Audio Analysis] Invalid video duration, using defaults', { videoDuration });
    return { maxVolumes: [], meanVolumes: [], medianMax: DEFAULTS.medianMax, medianMean: DEFAULTS.medianMean };
  }

  const numChunks = Math.ceil(videoDuration / chunkDuration);
  const maxVolumes: number[] = [];
  const meanVolumes: number[] = [];

  logger.debug(`[Audio Analysis] Analyzing ${numChunks} chunks of ${chunkDuration}s`);

  // Process chunks in batches of 3 to limit concurrent FFmpeg processes
  let batch: Promise<void>[] = [];

  for (let i = 0; i < numChunks; i++) {
    const startTime = i * chunkDuration;
    const actualDuration = Math.min(chunkDuration, videoDuration - startTime);
    if (actualDuration < 1) continue;

    batch.push(
      analyzeAudioChunk(inputPath, startTime, actualDuration).then((result) => {
        if (result) {
          maxVolumes.push(result.maxVolume);
          meanVolumes.push(result.meanVolume);
        }
      })
    );

    if (batch.length >= 3 || i === numChunks - 1) {
      await Promise.all(batch);
      batch = [];
    }
  }

  const medianMax = maxVolumes.length > 0 ? median(maxVolumes) : DEFAULTS.medianMax;
  const medianMean = meanVolumes.length > 0 ? median(meanVolumes) : DEFAULTS.medianMean;

  logger.debug(`[Audio Analysis] ${maxVolumes.length} chunks: medianMax=${medianMax.toFixed(1)}dB, medianMean=${medianMean.toFixed(1)}dB`);

  return { maxVolumes, meanVolumes, medianMax, medianMean };
}

/**
 * Phase 3: Percentile-based analysis using FFmpeg astats.
 * Provides peak/RMS levels and dynamic range for noise classification.
 * Uses speech-band filtering to focus on voice frequencies.
 */
export async function analyzeAudioPercentiles(
  inputPath: string,
  sampleDuration?: number
): Promise<PercentileStats | null> {
  return new Promise((resolve) => {
    let output = '';
    const inputOptions = sampleDuration ? ['-t', String(sampleDuration)] : [];

    ffmpeg(inputPath)
      .inputOptions(inputOptions)
      .audioFilters(`${SPEECH_BAND_FILTER},astats=measure_perchannel=Peak_level+RMS_level:measure_overall=Peak_level+RMS_level`)
      .format('null')
      .output('/dev/null')
      .on('stderr', (line: string) => { output += line + '\n'; })
      .on('end', () => {
        const peakMatch = output.match(/Peak level dB:\s*(-?[\d.]+)/i);
        const rmsMatch = output.match(/RMS level dB:\s*(-?[\d.]+)/i);

        if (!peakMatch || !rmsMatch) {
          logger.debug('[Audio Percentiles] Could not parse astats output');
          resolve(null);
          return;
        }

        const peakLevel = parseFloat(peakMatch[1]);
        const rmsLevel = parseFloat(rmsMatch[1]);
        const dynamicRange = peakLevel - rmsLevel;

        logger.debug(`[Audio Percentiles] peak=${peakLevel.toFixed(1)}dB, rms=${rmsLevel.toFixed(1)}dB, DR=${dynamicRange.toFixed(1)}dB`);
        resolve({ peakLevel, rmsLevel, dynamicRange });
      })
      .on('error', (err: Error) => {
        logger.debug(`[Audio Percentiles] Error: ${err.message}`);
        resolve(null);
      })
      .run();
  });
}

// ─── Threshold Calculation ──────────────────────────────────────────────────

interface ThresholdMethod {
  value: number;
  weight: number;
}

/**
 * Build threshold candidates for very noisy audio (DR < 8dB).
 *
 * When the noise floor is very close to speech peaks, we place the threshold
 * BETWEEN them. During speech pauses, the level drops to the noise floor
 * (below threshold). During speech, it rises above.
 */
function buildVeryNoisyThresholds(
  medianMax: number,
  medianMean: number,
  dynamicRange: number,
  rmsLevel?: number,
  peakLevel?: number
): ThresholdMethod[] {
  const methods: ThresholdMethod[] = [];

  // Midpoint between noise floor and speech peaks
  methods.push({ value: medianMean + dynamicRange * 0.5, weight: 2.0 });

  // Peak-relative with tight offset
  methods.push({ value: medianMax - dynamicRange * 0.6, weight: 1.0 });

  // RMS as noise floor proxy — place threshold slightly above
  if (rmsLevel !== undefined) {
    methods.push({ value: rmsLevel + dynamicRange * 0.3, weight: 1.2 });
  }

  // Peak-relative noise-aware threshold
  if (peakLevel !== undefined) {
    methods.push({ value: peakLevel - 3, weight: 1.5 });
  }

  return methods;
}

/**
 * Build threshold candidates for noisy audio (DR 8-12dB).
 *
 * More separation available than very noisy, so we place the threshold
 * between noise floor and speech but closer to the noise floor.
 */
function buildNoisyThresholds(
  medianMax: number,
  medianMean: number,
  dynamicRange: number,
  rmsLevel?: number,
  peakLevel?: number
): ThresholdMethod[] {
  const methods: ThresholdMethod[] = [];

  // Interpolated between noise floor and speech
  methods.push({ value: medianMean + dynamicRange * 0.35, weight: 1.5 });

  // Traditional peak-based with smaller offset
  methods.push({ value: medianMax - dynamicRange * 0.7, weight: 1.0 });

  // RMS-based
  if (rmsLevel !== undefined) {
    methods.push({ value: rmsLevel - 1, weight: 0.5 });
  }

  // Peak-relative noise-aware
  if (peakLevel !== undefined) {
    methods.push({ value: peakLevel - 6, weight: 0.8 });
  }

  return methods;
}

/**
 * Build threshold candidates for clean/moderate audio (DR > 12dB).
 *
 * Traditional approach using peak offset and mean-based methods.
 */
function buildCleanThresholds(
  medianMax: number,
  medianMean: number,
  noiseLevel: 'moderate' | 'clean',
  dynamicRange?: number,
  rmsLevel?: number
): ThresholdMethod[] {
  const methods: ThresholdMethod[] = [];

  // Traditional max - offset
  const peakOffset = noiseLevel === 'moderate' ? 9 : 10;
  methods.push({ value: medianMax - peakOffset, weight: 1.0 });

  // Mean-based
  methods.push({ value: medianMean - 2, weight: 0.5 });

  // RMS-based with standard offset
  if (rmsLevel !== undefined) {
    methods.push({ value: rmsLevel - 4, weight: 0.8 });

    // High dynamic range → can be more aggressive
    if (dynamicRange !== undefined && dynamicRange > 15) {
      methods.push({ value: medianMax - 12, weight: 0.5 });
    }
  }

  return methods;
}

function weightedAverage(methods: ThresholdMethod[]): number {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const { value, weight } of methods) {
    weightedSum += value * weight;
    totalWeight += weight;
  }
  return weightedSum / totalWeight;
}

/**
 * Calculate optimal silence threshold using multiple methods combined via weighted average.
 *
 * Strategy adapts based on audio noise level:
 * - Very noisy (DR < 8dB): Threshold placed between noise floor and speech peaks
 * - Noisy (DR 8-12dB): Interpolated threshold, closer to noise floor
 * - Clean/Moderate (DR > 12dB): Traditional peak-offset and RMS-based methods
 */
export function calculateAdaptiveThreshold(
  medianMax: number,
  medianMean: number,
  peakLevel?: number,
  rmsLevel?: number,
  dynamicRange?: number
): number {
  const noiseLevel = classifyNoise(dynamicRange);

  let methods: ThresholdMethod[];
  switch (noiseLevel) {
    case 'very_noisy':
      methods = buildVeryNoisyThresholds(medianMax, medianMean, dynamicRange!, rmsLevel, peakLevel);
      break;
    case 'noisy':
      methods = buildNoisyThresholds(medianMax, medianMean, dynamicRange!, rmsLevel, peakLevel);
      break;
    default:
      methods = buildCleanThresholds(medianMax, medianMean, noiseLevel, dynamicRange, rmsLevel);
  }

  let threshold = weightedAverage(methods);

  // Clamp to noise-level-appropriate bounds
  const upperLimit =
    noiseLevel === 'very_noisy' ? THRESHOLD_BOUNDS.upperVeryNoisy :
    noiseLevel === 'noisy' ? THRESHOLD_BOUNDS.upperNoisy :
    THRESHOLD_BOUNDS.upperClean;
  threshold = Math.min(upperLimit, Math.max(THRESHOLD_BOUNDS.lower, threshold));

  const noiseLabelMap: Record<NoiseLevel, string> = {
    very_noisy: 'VERY NOISY', noisy: 'NOISY', moderate: 'MODERATE NOISE', clean: '',
  };
  const noiseLabel = noiseLabelMap[noiseLevel];
  const gapFromMax = medianMax - threshold;

  logger.info(
    `[Adaptive Threshold] Input: medianMax=${medianMax.toFixed(1)}dB, medianMean=${medianMean.toFixed(1)}dB` +
    `${rmsLevel !== undefined ? `, rms=${rmsLevel.toFixed(1)}dB` : ''}` +
    `${dynamicRange !== undefined ? `, DR=${dynamicRange.toFixed(1)}dB` : ''}` +
    `${noiseLabel ? ` [${noiseLabel}]` : ''}`
  );
  logger.info(`[Adaptive Threshold] Methods: ${methods.map(m => `${m.value.toFixed(1)}dB(w=${m.weight})`).join(', ')}`);
  logger.info(`[Adaptive Threshold] Result: ${threshold.toFixed(1)}dB (${gapFromMax.toFixed(1)}dB below peak)${noiseLabel ? ` [${noiseLabel}]` : ''}`);

  return threshold;
}

// ─── Silence Detection ──────────────────────────────────────────────────────

/**
 * Detect silent intervals in audio using FFmpeg silencedetect.
 * Uses speech-band filtering (200Hz-3500Hz) to reject background noise.
 */
export async function detectSilence(
  inputPath: string,
  threshold: number = -20,
  minDuration: number = 0.3,
  useSpeechBandFilter: boolean = true
): Promise<SilenceInterval[]> {
  return new Promise((resolve, reject) => {
    const silences: SilenceInterval[] = [];
    let currentStart: number | null = null;

    const bandFilter = useSpeechBandFilter ? `${SPEECH_BAND_FILTER},` : '';
    const audioFilter = `${bandFilter}silencedetect=noise=${threshold}dB:d=${minDuration}`;

    logger.debug(`[Silence Detection] threshold=${threshold}dB, minDuration=${minDuration}s, speechBand=${useSpeechBandFilter}`);

    ffmpeg(inputPath)
      .audioFilters(audioFilter)
      .format('null')
      .output('/dev/null')
      .on('stderr', (line: string) => {
        const startMatch = line.match(/silence_start: ([\d.]+)/);
        if (startMatch) {
          currentStart = parseFloat(startMatch[1]);
        }
        const endMatch = line.match(/silence_end: ([\d.]+)/);
        if (endMatch && currentStart !== null) {
          silences.push({ start: currentStart, end: parseFloat(endMatch[1]) });
          currentStart = null;
        }
      })
      .on('end', () => {
        logger.debug(`[Silence Detection] Found ${silences.length} silent intervals`);
        resolve(silences);
      })
      .on('error', (err: Error) => {
        logger.error('[Silence Detection] Error:', err);
        reject(err);
      })
      .run();
  });
}

/**
 * Phase 2: Dual-pass detection with verification.
 * Runs detection at two thresholds and picks the result that removes more silence,
 * preferring aggressive removal while guarding against over-removal.
 */
async function dualPassSilenceDetection(
  inputPath: string,
  primaryThreshold: number,
  minDuration: number,
  videoDuration: number
): Promise<{ silences: SilenceInterval[]; threshold: number; wasAdjusted: boolean }> {
  // First pass: primary threshold
  const primarySilences = await detectSilence(inputPath, primaryThreshold, minDuration);
  const primarySilencePercent = totalSilencePercent(primarySilences, videoDuration);

  logger.debug(`[Dual-Pass] Primary: ${primarySilences.length} silences, ${primarySilencePercent.toFixed(1)}%`);

  // Second pass: more sensitive threshold (3dB lower)
  const sensitiveThreshold = primaryThreshold - 3;
  const sensitiveSilences = await detectSilence(inputPath, sensitiveThreshold, minDuration);
  const sensitiveSilencePercent = totalSilencePercent(sensitiveSilences, videoDuration);

  logger.debug(`[Dual-Pass] Sensitive: ${sensitiveSilences.length} silences, ${sensitiveSilencePercent.toFixed(1)}%`);

  // Pick the better result
  let finalSilences = primarySilences;
  let finalThreshold = primaryThreshold;
  let wasAdjusted = false;

  // Prefer sensitive results if primary found <40% silence and sensitive found >15% more
  if (primarySilencePercent < 40 && sensitiveSilencePercent > primarySilencePercent * 1.15) {
    finalSilences = sensitiveSilences;
    finalThreshold = sensitiveThreshold;
    wasAdjusted = true;
  }

  // Fallback: if primary found nothing but sensitive did
  if (finalSilences.length === 0 && sensitiveSilences.length > 0) {
    finalSilences = sensitiveSilences;
    finalThreshold = sensitiveThreshold;
    wasAdjusted = true;
  }

  if (primarySilencePercent > 85) {
    logger.warn(`[Dual-Pass] Very high silence (${primarySilencePercent.toFixed(1)}%), audio may be very quiet`);
  }

  const finalPercent = totalSilencePercent(finalSilences, videoDuration);
  logger.info(`[Dual-Pass] Final: ${finalSilences.length} silences (${finalPercent.toFixed(1)}%), threshold=${finalThreshold.toFixed(1)}dB${wasAdjusted ? ' (adjusted)' : ''}`);

  return { silences: finalSilences, threshold: finalThreshold, wasAdjusted };
}

function totalSilencePercent(silences: SilenceInterval[], videoDuration: number): number {
  const total = silences.reduce((sum, s) => sum + (s.end - s.start), 0);
  return (total / videoDuration) * 100;
}

/**
 * Adaptive silence detection — the main entry point.
 *
 * Three-phase approach:
 * 1. Full-video chunked analysis for robust volume statistics
 * 2. Dual-pass detection with verification for optimal threshold selection
 * 3. Percentile-based analysis (astats) for noise classification
 */
export async function detectSilenceAdaptive(
  inputPath: string,
  minDuration: number = 0.3,
  getVideoDuration: (path: string) => Promise<number>
): Promise<AdaptiveResult> {
  const videoDuration = await getVideoDuration(inputPath);
  logger.info(`[Adaptive Silence] Starting for ${videoDuration.toFixed(1)}s video`);

  // Phase 1: Full-video chunked analysis
  const chunkDuration = Math.min(30, videoDuration);
  const { medianMax, medianMean } = await analyzeFullVideoAudio(inputPath, videoDuration, chunkDuration);

  // Phase 3: Percentile analysis (sample first 60s or full video)
  const sampleDuration = Math.min(60, videoDuration);
  const percentileData = await analyzeAudioPercentiles(inputPath, sampleDuration);

  // Calculate adaptive threshold
  const adaptiveThreshold = calculateAdaptiveThreshold(
    medianMax, medianMean,
    percentileData?.peakLevel, percentileData?.rmsLevel, percentileData?.dynamicRange
  );

  logger.info(`[Adaptive Silence] Threshold: ${adaptiveThreshold.toFixed(1)}dB`);

  // Phase 2: Dual-pass detection
  const { silences, threshold, wasAdjusted } = await dualPassSilenceDetection(
    inputPath, adaptiveThreshold, minDuration, videoDuration
  );

  const silencePercent = totalSilencePercent(silences, videoDuration);
  const analysisInfo = `Adaptive: medianMax=${medianMax.toFixed(1)}dB, threshold=${threshold.toFixed(1)}dB${wasAdjusted ? ' (adjusted)' : ''}, ${silences.length} silences (${silencePercent.toFixed(1)}%)`;

  logger.info(`[Adaptive Silence] ${analysisInfo}`);

  return { silences, threshold, analysisInfo };
}

// ─── Segment Extraction ─────────────────────────────────────────────────────

export interface SegmentOptions {
  padding?: number;
  minSegmentDuration?: number;
  mergeGap?: number;
  timebackPadding?: number;
}

/**
 * Calculate non-silent segments from silence intervals.
 * Applies padding, filtering, merging, and timeback expansion for natural-sounding cuts.
 */
export function getNonSilentSegments(
  silences: SilenceInterval[],
  totalDuration: number,
  options: SegmentOptions = {}
): SilenceInterval[] {
  const padding = options.padding ?? SEGMENT_DEFAULTS.padding;
  const minDuration = options.minSegmentDuration ?? SEGMENT_DEFAULTS.minSegmentDuration;
  const mergeGap = options.mergeGap ?? SEGMENT_DEFAULTS.mergeGap;
  const paddingStart = options.timebackPadding ?? SEGMENT_DEFAULTS.timebackPaddingStart;
  const paddingEnd = SEGMENT_DEFAULTS.timebackPaddingEnd;

  // Step 1: Extract raw speech segments (gaps between silences)
  let segments = extractRawSegments(silences, totalDuration, padding);

  // Step 2: Filter out segments shorter than minimum duration
  segments = segments.filter(s => (s.end - s.start) >= minDuration);

  // Step 3: Merge segments closer together than mergeGap
  segments = mergeCloseSegments(segments, mergeGap);

  // Step 4: Expand segments with asymmetric timeback padding for natural breathing room
  if (paddingStart > 0 || paddingEnd > 0) {
    segments = expandAndRemerge(segments, totalDuration, paddingStart, paddingEnd);
  }

  logger.debug(
    `[Segments] ${segments.length} segments (padding=${padding}s, min=${minDuration}s, mergeGap=${mergeGap}s, ` +
    `tbStart=${paddingStart}s, tbEnd=${paddingEnd}s)`
  );

  return segments;
}

function extractRawSegments(
  silences: SilenceInterval[],
  totalDuration: number,
  padding: number
): SilenceInterval[] {
  const segments: SilenceInterval[] = [];
  let lastEnd = 0;

  for (const silence of silences) {
    if (silence.start > lastEnd) {
      const start = Math.max(0, lastEnd + padding);
      const end = Math.min(totalDuration, silence.start - padding);
      if (end > start) {
        segments.push({ start, end });
      }
    }
    lastEnd = silence.end;
  }

  // Final segment after last silence
  if (lastEnd < totalDuration) {
    const start = Math.max(0, lastEnd + padding);
    if (start < totalDuration) {
      segments.push({ start, end: totalDuration });
    }
  }

  return segments;
}

function mergeCloseSegments(segments: SilenceInterval[], mergeGap: number): SilenceInterval[] {
  if (segments.length <= 1) return segments;

  const merged: SilenceInterval[] = [{ ...segments[0] }];
  for (let i = 1; i < segments.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = segments[i];
    if (curr.start - prev.end <= mergeGap) {
      prev.end = curr.end;
    } else {
      merged.push({ ...curr });
    }
  }
  return merged;
}

function expandAndRemerge(
  segments: SilenceInterval[],
  totalDuration: number,
  paddingStart: number,
  paddingEnd: number
): SilenceInterval[] {
  const expanded = segments.map(s => ({
    start: Math.max(0, s.start - paddingStart),
    end: Math.min(totalDuration, s.end + paddingEnd),
  }));

  // Re-merge overlapping segments after expansion
  const result: SilenceInterval[] = [];
  for (const seg of expanded) {
    if (result.length === 0) {
      result.push({ ...seg });
    } else {
      const last = result[result.length - 1];
      if (seg.start <= last.end) {
        last.end = Math.max(last.end, seg.end);
      } else {
        result.push({ ...seg });
      }
    }
  }
  return result;
}
