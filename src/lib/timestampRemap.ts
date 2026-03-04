import type { SilenceInterval } from './ffmpeg';
import type { TranscriptionSegment, TranscriptionWord } from './whisper';

export interface SegmentMapEntry {
  originalStart: number;
  originalEnd: number;
  outputStart: number;
}

/**
 * Build a mapping from original timestamps to output timestamps based on kept segments.
 * Each entry records which original time range maps to what output offset.
 */
export function buildSegmentMap(keptSegments: SilenceInterval[]): SegmentMapEntry[] {
  const map: SegmentMapEntry[] = [];
  let outputOffset = 0;

  for (const seg of keptSegments) {
    map.push({
      originalStart: seg.start,
      originalEnd: seg.end,
      outputStart: outputOffset,
    });
    outputOffset += seg.end - seg.start;
  }

  return map;
}

/**
 * Remap a single timestamp from original timeline to output timeline.
 * Returns null if the timestamp falls in a removed region.
 */
export function remapTime(t: number, map: SegmentMapEntry[]): number | null {
  for (const entry of map) {
    if (t >= entry.originalStart && t <= entry.originalEnd) {
      return entry.outputStart + (t - entry.originalStart);
    }
  }
  return null;
}

/**
 * Remap transcription segments. Drops segments whose midpoint falls in a removed region.
 */
export function remapTranscriptionSegments(
  segments: TranscriptionSegment[],
  map: SegmentMapEntry[]
): TranscriptionSegment[] {
  const result: TranscriptionSegment[] = [];

  for (const seg of segments) {
    const midpoint = (seg.start + seg.end) / 2;
    const newStart = remapTime(seg.start, map);
    const newEnd = remapTime(seg.end, map);
    const newMid = remapTime(midpoint, map);

    // Drop if midpoint is in removed region
    if (newMid === null) continue;

    // Use remapped start/end if available, otherwise clamp to midpoint
    result.push({
      start: newStart ?? newMid,
      end: newEnd ?? newMid,
      text: seg.text,
    });
  }

  return result;
}

/**
 * Remap word-level timestamps. Drops words whose midpoint falls in a removed region.
 */
export function remapWords(
  words: TranscriptionWord[],
  map: SegmentMapEntry[]
): TranscriptionWord[] {
  const result: TranscriptionWord[] = [];

  for (const word of words) {
    const midpoint = (word.start + word.end) / 2;
    const newStart = remapTime(word.start, map);
    const newEnd = remapTime(word.end, map);
    const newMid = remapTime(midpoint, map);

    if (newMid === null) continue;

    result.push({
      word: word.word,
      start: newStart ?? newMid,
      end: newEnd ?? newMid,
    });
  }

  return result;
}
