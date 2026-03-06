import { logger } from './logger';
import { SpeechSegment } from './sileroVadDetection';
import { TranscriptionWord } from './whisper';
import { SilenceInterval } from './ffmpeg';

/**
 * A refined speech segment that combines VAD output with transcription word boundaries
 */
export interface RefinedSpeechSegment {
  start: number;
  end: number;
  confidence: number;
  words: TranscriptionWord[];
  /** True if VAD detected speech but no words matched (likely non-verbal audio) */
  isNonVerbal: boolean;
}

/**
 * Configuration for hybrid boundary refinement
 */
export interface RefinementConfig {
  /** Padding before first word start to catch plosive onsets (ms). Default: 150 */
  prePlosivePadMs: number;
  /** Padding after last word end to catch trailing sounds (ms). Default: 200 */
  postTrailingPadMs: number;
  /** Maximum gap between speech segments to merge them (ms). Default: 300 */
  mergeGapMs: number;
}

export const DEFAULT_REFINEMENT_CONFIG: RefinementConfig = {
  prePlosivePadMs: 150,
  postTrailingPadMs: 200,
  mergeGapMs: 300,
};

/**
 * Cross-reference Silero VAD speech segments with word-level timestamps
 * from transcription to produce refined cut boundaries.
 *
 * Logic:
 * 1. For each VAD segment, find overlapping words
 * 2. Extend segment boundaries to encompass full word spans (with padding)
 * 3. Handle edge cases: non-verbal audio, VAD false negatives
 * 4. Merge close segments to preserve natural phrasing
 */
export function refineWithWordBoundaries(
  speechSegments: SpeechSegment[],
  words: TranscriptionWord[],
  totalDuration: number,
  config: RefinementConfig = DEFAULT_REFINEMENT_CONFIG
): RefinedSpeechSegment[] {
  if (words.length === 0) {
    logger.debug('[Boundary Refinement] No word timestamps available, using VAD segments as-is');
    return speechSegments.map(seg => ({
      ...seg,
      words: [],
      isNonVerbal: false,
    }));
  }

  const prePad = config.prePlosivePadMs / 1000;
  const postPad = config.postTrailingPadMs / 1000;
  const mergeGap = config.mergeGapMs / 1000;

  // Track which words have been assigned to a segment
  const wordAssigned = new Array(words.length).fill(false);

  const refined: RefinedSpeechSegment[] = [];

  // For each VAD speech segment, find overlapping words
  for (const seg of speechSegments) {
    const overlappingWords: TranscriptionWord[] = [];
    const overlappingIndices: number[] = [];

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      // Word overlaps with segment if word.start < seg.end AND word.end > seg.start
      if (word.start < seg.end && word.end > seg.start) {
        overlappingWords.push(word);
        overlappingIndices.push(i);
        wordAssigned[i] = true;
      }
    }

    if (overlappingWords.length === 0) {
      // VAD detected speech but no transcription words found
      // This is likely non-verbal audio (laugh, breath, sound effect)
      refined.push({
        start: seg.start,
        end: seg.end,
        confidence: seg.confidence,
        words: [],
        isNonVerbal: true,
      });
    } else {
      // Use word boundaries as the source of truth with padding for plosive
      // onsets / trailing consonants. Do NOT extend to VAD boundaries — the
      // VAD can overshoot by hundreds of milliseconds, embedding silence
      // inside the kept segment where gap processing can never reach it.
      const earliestWord = Math.min(...overlappingWords.map(w => w.start));
      const latestWord = Math.max(...overlappingWords.map(w => w.end));

      const refinedStart = Math.max(0, earliestWord - prePad);
      const refinedEnd = Math.min(totalDuration, latestWord + postPad);

      refined.push({
        start: refinedStart,
        end: refinedEnd,
        confidence: seg.confidence,
        words: overlappingWords,
        isNonVerbal: false,
      });
    }
  }

  // Handle VAD false negatives: words that the transcription found
  // but VAD missed (e.g., very soft speech). Use extra padding since
  // Whisper timestamps are less reliable for soft/ambiguous speech.
  const vadFalseNegPad = 1.5; // 50% extra padding for uncertain boundaries
  for (let i = 0; i < words.length; i++) {
    if (!wordAssigned[i]) {
      const word = words[i];
      refined.push({
        start: Math.max(0, word.start - prePad * vadFalseNegPad),
        end: Math.min(totalDuration, word.end + postPad * vadFalseNegPad),
        confidence: 0.5,
        words: [word],
        isNonVerbal: false,
      });
      logger.debug(`[Boundary Refinement] VAD false negative: word "${word.word}" at ${word.start.toFixed(2)}s not detected by VAD`);
    }
  }

  // Sort by start time
  refined.sort((a, b) => a.start - b.start);

  // Merge segments that are close together (same phrase)
  const merged = mergeRefinedSegments(refined, mergeGap, totalDuration);

  logger.info(`[Boundary Refinement] Refined ${speechSegments.length} VAD segments → ${merged.length} segments (${words.length} words matched)`);

  return merged;
}

/**
 * Merge refined speech segments that are within mergeGap of each other
 */
function mergeRefinedSegments(
  segments: RefinedSpeechSegment[],
  mergeGap: number,
  totalDuration: number
): RefinedSpeechSegment[] {
  if (segments.length <= 1) return segments;

  const merged: RefinedSpeechSegment[] = [{ ...segments[0], words: [...segments[0].words] }];

  for (let i = 1; i < segments.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = segments[i];

    if (curr.start - prev.end <= mergeGap) {
      // Merge segments
      prev.end = Math.min(totalDuration, Math.max(prev.end, curr.end));
      prev.confidence = (prev.confidence + curr.confidence) / 2;
      prev.words = [...prev.words, ...curr.words];
      prev.isNonVerbal = prev.isNonVerbal && curr.isNonVerbal;
    } else {
      merged.push({ ...curr, words: [...curr.words] });
    }
  }

  return merged;
}

/**
 * Convert refined speech segments back to silence intervals
 * for use with the existing removeSilence pipeline
 */
export function refinedSegmentsToSilences(
  segments: RefinedSpeechSegment[],
  totalDuration: number
): SilenceInterval[] {
  const silences: SilenceInterval[] = [];

  if (segments.length === 0) {
    return [{ start: 0, end: totalDuration }];
  }

  // Gap before first segment
  if (segments[0].start > 0.01) {
    silences.push({ start: 0, end: segments[0].start });
  }

  // Gaps between segments
  for (let i = 0; i < segments.length - 1; i++) {
    const gapStart = segments[i].end;
    const gapEnd = segments[i + 1].start;
    if (gapEnd - gapStart > 0.01) {
      silences.push({ start: gapStart, end: gapEnd });
    }
  }

  // Gap after last segment
  const lastEnd = segments[segments.length - 1].end;
  if (totalDuration - lastEnd > 0.01) {
    silences.push({ start: lastEnd, end: totalDuration });
  }

  return silences;
}
