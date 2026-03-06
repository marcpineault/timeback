import { logger } from './logger';
import { SilenceInterval } from './ffmpeg';
import { RefinedSpeechSegment } from './hybridBoundaryRefinement';

/**
 * Configuration for intelligent gap processing
 */
export interface GapProcessingConfig {
  /** Minimum gap to retain between speech segments (ms). Default: 300 */
  minRetainedGapMs: number;
  /** Gap after sentence-ending punctuation (. ! ?) (ms). Default: 600 */
  sentenceGapMs: number;
  /** Gap after clause-ending punctuation (, ; :) (ms). Default: 400 */
  clauseGapMs: number;
  /** Gap mid-sentence with no punctuation (ms). Default: 250 */
  midSentenceGapMs: number;
  /** Gap between different paragraphs/topics (ms). Default: 800 */
  paragraphGapMs: number;
  /** Maximum allowed gap (ms). Longer gaps are reduced. Default: 2000 */
  maxGapMs: number;
  /** Minimum silence duration to trigger removal (ms). Default: 800 */
  minSilenceToRemoveMs: number;
  /** How to handle detected breaths: 'keep' | 'reduce' | 'remove'. Default: 'reduce' */
  breathHandling: 'keep' | 'reduce' | 'remove';
}

export const DEFAULT_GAP_CONFIG: GapProcessingConfig = {
  minRetainedGapMs: 8,
  sentenceGapMs: 25,
  clauseGapMs: 17,
  midSentenceGapMs: 7,
  paragraphGapMs: 35,
  maxGapMs: 500,
  minSilenceToRemoveMs: 80,
  breathHandling: 'remove',
};

/**
 * Breath segment detected in audio
 */
export interface BreathSegment {
  start: number;
  end: number;
  /** Whether this breath falls within a speech segment (mid-sentence) */
  isMidSentence: boolean;
}

/**
 * Result of gap processing
 */
export interface GapProcessingResult {
  /** Final speech segments to keep */
  segments: Array<{ start: number; end: number }>;
  /** Gaps with their target durations */
  gaps: Array<{ originalStart: number; originalEnd: number; targetDuration: number }>;
  /** Detected breath segments */
  breaths: BreathSegment[];
}

/**
 * Determine the appropriate gap duration based on the punctuation
 * at the end of the preceding speech segment
 */
function getContextualGapDuration(
  precedingText: string,
  config: GapProcessingConfig
): number {
  const trimmed = precedingText.trim();

  if (!trimmed) {
    return config.midSentenceGapMs / 1000;
  }

  const lastChar = trimmed[trimmed.length - 1];

  // Sentence-ending punctuation
  if ('.!?'.includes(lastChar)) {
    return config.sentenceGapMs / 1000;
  }

  // Clause-ending punctuation
  if (',;:'.includes(lastChar)) {
    return config.clauseGapMs / 1000;
  }

  // Mid-sentence (no punctuation)
  return config.midSentenceGapMs / 1000;
}

/**
 * Process speech segments with intelligent gap management
 *
 * Instead of simply removing all silence, this applies context-aware
 * gap sizing based on transcription punctuation. It ensures:
 * - Natural pauses are preserved after sentences
 * - Short natural pauses are never removed
 * - Long dead air is reduced to appropriate duration
 * - Machine-gun speech is prevented
 */
export function processGaps(
  speechSegments: RefinedSpeechSegment[],
  totalDuration: number,
  config: GapProcessingConfig = DEFAULT_GAP_CONFIG
): GapProcessingResult {
  if (speechSegments.length === 0) {
    return { segments: [], gaps: [], breaths: [] };
  }

  const minSilenceToRemove = config.minSilenceToRemoveMs / 1000;
  const minRetainedGap = config.minRetainedGapMs / 1000;
  const maxGap = config.maxGapMs / 1000;

  const resultSegments: Array<{ start: number; end: number }> = [];
  const resultGaps: Array<{ originalStart: number; originalEnd: number; targetDuration: number }> = [];

  // Add all speech segments
  for (const seg of speechSegments) {
    resultSegments.push({ start: seg.start, end: seg.end });
  }

  // Process gaps between consecutive segments
  for (let i = 0; i < speechSegments.length - 1; i++) {
    const currentSeg = speechSegments[i];
    const nextSeg = speechSegments[i + 1];
    const gapStart = currentSeg.end;
    const gapEnd = nextSeg.start;
    const gapDuration = gapEnd - gapStart;

    if (gapDuration <= 0) continue;

    // Don't touch silences shorter than minSilenceToRemove — they're natural pauses
    if (gapDuration < minSilenceToRemove) {
      logger.debug(`[Gap Processing] Gap ${i}: ${(gapDuration * 1000).toFixed(0)}ms — KEPT (below ${config.minSilenceToRemoveMs}ms threshold)`);
      resultGaps.push({
        originalStart: gapStart,
        originalEnd: gapEnd,
        targetDuration: gapDuration, // Keep original
      });
      continue;
    }

    // Get contextual gap duration based on preceding text
    const precedingText = currentSeg.words.map(w => w.word).join(' ');
    let targetGap = getContextualGapDuration(precedingText, config);

    // Enforce minimum gap
    targetGap = Math.max(targetGap, minRetainedGap);

    // Enforce maximum gap
    targetGap = Math.min(targetGap, maxGap);

    // Don't extend gaps that are already shorter than target
    targetGap = Math.min(targetGap, gapDuration);

    const removed = gapDuration - targetGap;
    logger.debug(`[Gap Processing] Gap ${i}: ${(gapDuration * 1000).toFixed(0)}ms → ${(targetGap * 1000).toFixed(0)}ms — REMOVED ${(removed * 1000).toFixed(0)}ms`);

    resultGaps.push({
      originalStart: gapStart,
      originalEnd: gapEnd,
      targetDuration: targetGap,
    });
  }

  const totalOriginalGap = resultGaps.reduce((sum, g) => sum + (g.originalEnd - g.originalStart), 0);
  const totalTargetGap = resultGaps.reduce((sum, g) => sum + g.targetDuration, 0);
  const timeRemoved = totalOriginalGap - totalTargetGap;

  logger.info(`[Gap Processing] ${resultGaps.length} gaps processed: ${totalOriginalGap.toFixed(1)}s → ${totalTargetGap.toFixed(1)}s (removed ${timeRemoved.toFixed(1)}s)`);

  return {
    segments: resultSegments,
    gaps: resultGaps,
    breaths: [], // Breath detection handled in boundary refinement
  };
}

/**
 * Build the final non-silent segments from gap processing results.
 *
 * This replaces getNonSilentSegments when using the hybrid pipeline.
 * Instead of the original approach of "invert silences to get speech",
 * this directly uses the speech segments and applies contextual gap sizing.
 */
export function buildFinalSegments(
  speechSegments: RefinedSpeechSegment[],
  totalDuration: number,
  config: GapProcessingConfig = DEFAULT_GAP_CONFIG
): SilenceInterval[] {
  if (speechSegments.length === 0) {
    return [];
  }

  const minSilenceToRemove = config.minSilenceToRemoveMs / 1000;
  const minRetainedGap = config.minRetainedGapMs / 1000;
  const maxGap = config.maxGapMs / 1000;

  // Start with the speech segments themselves
  const keepSegments: SilenceInterval[] = [];
  let gapsKept = 0;
  let gapsShortened = 0;
  let totalRemoved = 0;

  for (let i = 0; i < speechSegments.length; i++) {
    const seg = speechSegments[i];
    const segEntry: SilenceInterval = { start: seg.start, end: seg.end };

    if (i < speechSegments.length - 1) {
      const nextSeg = speechSegments[i + 1];
      const gapDuration = nextSeg.start - seg.end;

      if (gapDuration > 0 && gapDuration < minSilenceToRemove) {
        // Gap is too short to remove — extend this segment to include it
        logger.debug(`[Gap Processing] Segment ${i}: gap ${(gapDuration * 1000).toFixed(0)}ms — KEPT (below ${config.minSilenceToRemoveMs}ms threshold)`);
        gapsKept++;
        segEntry.end = nextSeg.start;
      } else if (gapDuration >= minSilenceToRemove) {
        // Gap is long enough to process — determine target gap
        const precedingText = seg.words.map(w => w.word).join(' ');
        let targetGap = getContextualGapDuration(precedingText, config);
        targetGap = Math.max(targetGap, minRetainedGap);
        targetGap = Math.min(targetGap, maxGap);
        targetGap = Math.min(targetGap, gapDuration);

        // Extend segment end to include retained gap portion
        // The gap will be: seg.end to seg.end + targetGap
        // We extend the segment end by a fraction of the gap to center the retained silence
        const retainedGapStart = seg.end;
        const retainedGapEnd = seg.end + targetGap;

        // Add the retained gap as part of the segment
        segEntry.end = retainedGapEnd;
        gapsShortened++;
        totalRemoved += gapDuration - targetGap;
      }
    }

    keepSegments.push(segEntry);
  }

  logger.info(`[Gap Processing] ${gapsKept + gapsShortened} gaps: ${gapsShortened} shortened (removed ${totalRemoved.toFixed(1)}s), ${gapsKept} kept (below ${config.minSilenceToRemoveMs}ms)`);

  // Merge overlapping segments
  const merged: SilenceInterval[] = [];
  for (const seg of keepSegments) {
    if (merged.length === 0) {
      merged.push({ ...seg });
    } else {
      const prev = merged[merged.length - 1];
      if (seg.start <= prev.end) {
        prev.end = Math.max(prev.end, seg.end);
      } else {
        merged.push({ ...seg });
      }
    }
  }

  // Clamp to total duration
  for (const seg of merged) {
    seg.start = Math.max(0, seg.start);
    seg.end = Math.min(totalDuration, seg.end);
  }

  logger.info(`[Gap Processing] Built ${merged.length} final segments from ${speechSegments.length} speech segments`);

  return merged;
}
