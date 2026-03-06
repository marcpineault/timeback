import { SilenceInterval } from './ffmpeg';

/**
 * Build FFmpeg filter complex for concatenation with crossfades.
 *
 * Trims each segment from the input, applies short audio fades at
 * splice points to prevent clicks, then concatenates all segments.
 */
export function buildCrossfadeFilterComplex(
  segments: SilenceInterval[],
  crossfadeMs: number = 20,
  hasRoomTone: boolean = false,
): { filterComplex: string; outputLabels: { video: string; audio: string } } {
  if (segments.length === 0) {
    return { filterComplex: '', outputLabels: { video: 'outv', audio: 'outa' } };
  }

  const filterParts: string[] = [];
  const concatInputs: string[] = [];

  // Generate trim filters for each segment
  segments.forEach((segment, index) => {
    // Randomize crossfade per segment (0.6–1.4x base) to avoid uniform pattern
    const jitter = 0.6 + Math.random() * 0.8;
    const crossfadeSec = (crossfadeMs / 1000) * jitter;

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
    filterParts.push(
      `${concatInputs.join('')}concat=n=${segments.length}:v=1:a=1[outv][outa_raw]`
    );
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
