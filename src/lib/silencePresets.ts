/**
 * Silence removal preset names
 */
export type SilencePresetName = 'natural' | 'gentle';

/**
 * Silence removal preset configuration
 *
 * The VAD-primary pipeline uses these values directly:
 * - vadThreshold controls speech detection sensitivity
 * - prePadMs/postPadMs add padding around VAD segments for clean cuts
 * - minSilenceToRemoveMs sets the VAD's minimum silence gap to report
 */
export interface SilencePreset {
  name: string;
  description: string;
  /** Padding before speech segment to catch plosive onsets (ms) */
  prePadMs: number;
  /** Padding after speech segment to catch trailing consonants (ms) */
  postPadMs: number;
  /** Minimum silence duration for VAD to report (ms) */
  minSilenceToRemoveMs: number;
  /** Silero VAD threshold (higher = stricter speech detection) */
  vadThreshold: number;
}

/**
 * The editing presets that control silence removal aggressiveness
 */
export const SILENCE_PRESETS: Record<SilencePresetName, SilencePreset> = {
  natural: {
    name: 'Natural',
    description: 'Conversational, podcast style (default) — tight editing',
    prePadMs: 25,
    postPadMs: 50,
    minSilenceToRemoveMs: 120,
    vadThreshold: 0.50,
  },
  gentle: {
    name: 'Gentle',
    description: 'Light editing, presentations/lectures — brief pauses kept',
    prePadMs: 60,
    postPadMs: 100,
    minSilenceToRemoveMs: 400,
    vadThreshold: 0.45,
  },
};

/**
 * Validate a preset name, defaulting to 'natural' if invalid
 */
export function validatePresetName(name: string | undefined | null): SilencePresetName {
  if (name && name in SILENCE_PRESETS) {
    return name as SilencePresetName;
  }
  return 'natural';
}
