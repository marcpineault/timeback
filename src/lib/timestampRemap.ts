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
 * Remap a timestamp, snapping to the nearest segment boundary if it falls
 * in a removed region. This prevents captions from collapsing to zero
 * duration when a word straddles a cut point.
 */
export function remapTimeSnap(t: number, map: SegmentMapEntry[]): number | null {
  // Exact match first
  const exact = remapTime(t, map);
  if (exact !== null) return exact;

  if (map.length === 0) return null;

  // Snap to nearest segment boundary
  let bestOutput: number | null = null;
  let bestDist = Infinity;

  for (const entry of map) {
    const segDuration = entry.originalEnd - entry.originalStart;

    // Distance to segment start
    const distStart = Math.abs(t - entry.originalStart);
    if (distStart < bestDist) {
      bestDist = distStart;
      bestOutput = entry.outputStart;
    }

    // Distance to segment end
    const distEnd = Math.abs(t - entry.originalEnd);
    if (distEnd < bestDist) {
      bestDist = distEnd;
      bestOutput = entry.outputStart + segDuration;
    }
  }

  // Only snap if reasonably close (within 500ms)
  return bestDist <= 0.5 ? bestOutput : null;
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
    const newMid = remapTime(midpoint, map);

    // Drop if midpoint is in removed region
    if (newMid === null) continue;

    // Use snap remapping so boundaries that straddle a cut don't collapse
    const newStart = remapTimeSnap(seg.start, map);
    const newEnd = remapTimeSnap(seg.end, map);

    result.push({
      start: newStart ?? newMid,
      end: Math.max((newStart ?? newMid) + 0.01, newEnd ?? newMid),
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
    const newMid = remapTime(midpoint, map);

    if (newMid === null) continue;

    // Use snap remapping so word boundaries that straddle a cut point
    // snap to the nearest segment edge instead of collapsing to midpoint
    const newStart = remapTimeSnap(word.start, map);
    const newEnd = remapTimeSnap(word.end, map);

    result.push({
      word: word.word,
      start: newStart ?? newMid,
      end: Math.max((newStart ?? newMid) + 0.01, newEnd ?? newMid),
    });
  }

  return result;
}
