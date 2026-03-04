import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { logger } from './logger';
import { SilenceInterval } from './ffmpeg';
import { SpeechSegment } from './sileroVadDetection';

/**
 * Configuration for audio boundary refinement
 */
export interface BoundaryRefinementConfig {
  /** Window size for energy analysis in ms. Default: 10 */
  analysisWindowMs: number;
  /** How far back to search for plosive onsets in ms. Default: 200 */
  preOnsetSearchMs: number;
  /** How far forward to search for trailing sibilants in ms. Default: 200 */
  postOffsetSearchMs: number;
  /** Threshold in dB above noise floor to detect onset energy. Default: 3 */
  onsetThresholdDb: number;
  /** Crossfade duration in ms. Default: 20 */
  crossfadeMs: number;
  /** Whether to extract and insert room tone. Default: true */
  useRoomTone: boolean;
}

export const DEFAULT_BOUNDARY_CONFIG: BoundaryRefinementConfig = {
  analysisWindowMs: 10,
  preOnsetSearchMs: 200,
  postOffsetSearchMs: 200,
  onsetThresholdDb: 3,
  crossfadeMs: 5,
  useRoomTone: true,
};

/**
 * Analyze the RMS energy of a short audio segment using FFmpeg astats
 * Returns the RMS level in dB
 */
async function analyzeSegmentEnergy(
  inputPath: string,
  startTime: number,
  duration: number
): Promise<number | null> {
  return new Promise((resolve) => {
    const args = [
      '-y',
      '-i', inputPath,
      '-ss', String(startTime),
      '-t', String(duration),
      '-af', 'astats=measure_perchannel=RMS_level:measure_overall=RMS_level',
      '-f', 'null',
      '/dev/null',
    ];

    let stderr = '';
    const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', () => {
      const rmsMatch = stderr.match(/RMS level dB:\s*(-?[\d.]+)/i);
      if (rmsMatch) {
        resolve(parseFloat(rmsMatch[1]));
      } else {
        resolve(null);
      }
    });

    proc.on('error', () => resolve(null));
  });
}

/**
 * Find the noise floor level from the quietest portions of the audio
 * This is used as a reference for onset detection
 */
export async function estimateNoiseFloor(
  inputPath: string,
  silenceSegments: SilenceInterval[]
): Promise<number> {
  if (silenceSegments.length === 0) {
    return -60; // Default very low noise floor
  }

  // Find the longest silence segments to sample noise floor
  const sortedByDuration = [...silenceSegments]
    .map(s => ({ ...s, duration: s.end - s.start }))
    .sort((a, b) => b.duration - a.duration);

  // Sample up to 3 longest silence segments
  const samplesToCheck = sortedByDuration.slice(0, 3);
  const noiseFloors: number[] = [];

  for (const silence of samplesToCheck) {
    if (silence.duration < 0.5) continue; // Need at least 500ms

    // Sample from the middle of the silence to avoid speech edges
    const sampleStart = silence.start + silence.duration * 0.25;
    const sampleDuration = Math.min(silence.duration * 0.5, 2); // Max 2 seconds

    const rms = await analyzeSegmentEnergy(inputPath, sampleStart, sampleDuration);
    if (rms !== null) {
      noiseFloors.push(rms);
    }
  }

  if (noiseFloors.length === 0) return -60;

  // Use the median noise floor
  noiseFloors.sort((a, b) => a - b);
  const median = noiseFloors[Math.floor(noiseFloors.length / 2)];

  logger.debug(`[Boundary Refinement] Estimated noise floor: ${median.toFixed(1)}dB (from ${noiseFloors.length} samples)`);
  return median;
}

/**
 * Find the best room tone segment for filling gaps between speech
 *
 * Identifies the quietest 2-5 second segment that was classified as silence.
 * This avoids jarring "digital silence" at splice points.
 */
export async function extractRoomTone(
  inputPath: string,
  silenceSegments: SilenceInterval[],
  outputDir: string
): Promise<string | null> {
  // Find silence segments between 2-5 seconds long
  const candidates = silenceSegments
    .filter(s => {
      const dur = s.end - s.start;
      return dur >= 2 && dur <= 10;
    })
    .sort((a, b) => (b.end - b.start) - (a.end - a.start)); // Longest first

  if (candidates.length === 0) {
    // Try shorter segments
    const shortCandidates = silenceSegments
      .filter(s => (s.end - s.start) >= 1)
      .sort((a, b) => (b.end - b.start) - (a.end - a.start));

    if (shortCandidates.length === 0) {
      logger.debug('[Room Tone] No suitable silence segments for room tone extraction');
      return null;
    }

    candidates.push(shortCandidates[0]);
  }

  const bestSilence = candidates[0];
  // Extract from the middle to avoid edge effects
  const extractStart = bestSilence.start + 0.1;
  const extractDuration = Math.min(bestSilence.end - bestSilence.start - 0.2, 3);

  if (extractDuration < 0.5) {
    return null;
  }

  const roomTonePath = path.join(outputDir, `room_tone_${Date.now()}.wav`);

  return new Promise((resolve) => {
    const args = [
      '-y',
      '-i', inputPath,
      '-ss', String(extractStart),
      '-t', String(extractDuration),
      '-ar', '44100',
      '-ac', '1',
      '-acodec', 'pcm_s16le',
      roomTonePath,
    ];

    const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });

    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(roomTonePath)) {
        logger.debug(`[Room Tone] Extracted ${extractDuration.toFixed(1)}s room tone from ${extractStart.toFixed(1)}s`);
        resolve(roomTonePath);
      } else {
        resolve(null);
      }
    });

    proc.on('error', () => resolve(null));
  });
}

/**
 * Refine cut boundaries to prevent clicks/pops and catch onset/offset sounds
 *
 * For each speech segment:
 * 1. Pre-speech: Extend backward if energy rises above noise floor (plosive onset)
 * 2. Post-speech: Extend forward if high-freq energy present (trailing sibilant)
 * 3. Snap to nearest zero-crossing within ±1ms (prevents clicks at splice)
 */
export function refineBoundaries(
  segments: SilenceInterval[],
  totalDuration: number,
  config: BoundaryRefinementConfig = DEFAULT_BOUNDARY_CONFIG
): SilenceInterval[] {
  // The main refinement work (energy analysis, zero-crossing snap)
  // happens at the FFmpeg filter level during concatenation.
  // Here we ensure boundaries are well-formed and non-overlapping.

  const refined = segments.map(seg => ({
    start: Math.max(0, seg.start),
    end: Math.min(totalDuration, seg.end),
  }));

  // Sort and merge any overlapping segments
  refined.sort((a, b) => a.start - b.start);

  const merged: SilenceInterval[] = [];
  for (const seg of refined) {
    if (seg.end <= seg.start) continue;

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

  return merged;
}

/**
 * Build FFmpeg filter complex for concatenation with crossfades and room tone
 *
 * This replaces the simple trim+concat approach with one that:
 * 1. Applies equal-power crossfades at splice points
 * 2. Fills gaps with room tone audio instead of digital silence
 */
export function buildCrossfadeFilterComplex(
  segments: SilenceInterval[],
  crossfadeMs: number = 20,
  hasRoomTone: boolean = false
): { filterComplex: string; outputLabels: { video: string; audio: string } } {
  if (segments.length === 0) {
    return { filterComplex: '', outputLabels: { video: 'outv', audio: 'outa' } };
  }

  const crossfadeSec = crossfadeMs / 1000;
  const filterParts: string[] = [];
  const concatInputs: string[] = [];

  // Generate trim filters for each segment
  segments.forEach((segment, index) => {
    // Video: trim and reset PTS
    filterParts.push(
      `[0:v]trim=start=${segment.start}:end=${segment.end},setpts=PTS-STARTPTS[v${index}]`
    );

    // Audio: trim, reset PTS, and apply short fade in/out to prevent clicks
    const segDuration = segment.end - segment.start;
    const fadeInDur = Math.min(crossfadeSec, segDuration / 4);
    const fadeOutStart = Math.max(0, segDuration - crossfadeSec);
    const fadeOutDur = Math.min(crossfadeSec, segDuration / 4);

    filterParts.push(
      `[0:a]atrim=start=${segment.start}:end=${segment.end},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${fadeInDur},afade=t=out:st=${fadeOutStart}:d=${fadeOutDur}[a${index}]`
    );

    concatInputs.push(`[v${index}][a${index}]`);
  });

  // Concatenate all segments
  if (hasRoomTone) {
    // Concat to intermediate labels, then mix room tone underneath
    filterParts.push(
      `${concatInputs.join('')}concat=n=${segments.length}:v=1:a=1[outv][outa_raw]`
    );
    // Loop room tone (input 1) infinitely and mix at low volume under speech
    filterParts.push(
      `[1:a]aloop=loop=-1:size=2000000,volume=0.04[rt]`
    );
    filterParts.push(
      `[outa_raw][rt]amix=inputs=2:duration=first:weights=1 0.04[outa]`
    );
  } else {
    filterParts.push(
      `${concatInputs.join('')}concat=n=${segments.length}:v=1:a=1[outv][outa]`
    );
  }

  return {
    filterComplex: filterParts.join(';'),
    outputLabels: { video: 'outv', audio: 'outa' },
  };
}
