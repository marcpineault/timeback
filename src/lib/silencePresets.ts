import { SileroVadConfig, DEFAULT_VAD_CONFIG } from './sileroVadDetection';
import { RefinementConfig, DEFAULT_REFINEMENT_CONFIG } from './hybridBoundaryRefinement';
import { GapProcessingConfig, DEFAULT_GAP_CONFIG } from './gapProcessing';
import { BoundaryRefinementConfig, DEFAULT_BOUNDARY_CONFIG } from './boundaryRefinement';

/**
 * Silence removal preset names
 */
export type SilencePresetName = 'natural' | 'gentle';

/**
 * Complete silence removal preset configuration
 */
export interface SilencePreset {
  name: string;
  description: string;
  /** Silero VAD speech padding (ms) — used as fallback when word timestamps unavailable */
  speechPadMs: number;
  /** Padding before speech segments (ms) — applied by word boundary refinement */
  prePadMs: number;
  /** Padding after speech segments (ms) — applied by word boundary refinement */
  postPadMs: number;
  /** Minimum silence duration to trigger removal (ms) */
  minSilenceToRemoveMs: number;
  /** Minimum gap to retain between speech segments (ms) */
  minRetainedGapMs: number;
  /** Gap after sentence-ending punctuation (ms) */
  sentenceGapMs: number;
  /** How to handle breaths: 'keep' | 'reduce' | 'remove' */
  breathHandling: 'keep' | 'reduce' | 'remove';
  /** Silero VAD threshold (higher = detects less as speech) */
  vadThreshold: number;
}

/**
 * The editing presets that control silence removal aggressiveness
 */
export const SILENCE_PRESETS: Record<SilencePresetName, SilencePreset> = {
  natural: {
    name: 'Natural',
    description: 'Conversational, podcast style (default) — tight editing',
    speechPadMs: 40,
    prePadMs: 100,
    postPadMs: 180,
    minSilenceToRemoveMs: 300,
    minRetainedGapMs: 40,
    sentenceGapMs: 100,
    breathHandling: 'remove',
    vadThreshold: 0.45,
  },
  gentle: {
    name: 'Gentle',
    description: 'Light editing, presentations/lectures — brief pauses kept',
    speechPadMs: 60,
    prePadMs: 120,
    postPadMs: 200,
    minSilenceToRemoveMs: 800,
    minRetainedGapMs: 80,
    sentenceGapMs: 180,
    breathHandling: 'remove',
    vadThreshold: 0.40,
  },
};

/**
 * Build the full set of module configs from a preset
 */
export function getConfigsFromPreset(presetName: SilencePresetName): {
  vadConfig: SileroVadConfig;
  refinementConfig: RefinementConfig;
  gapConfig: GapProcessingConfig;
  boundaryConfig: BoundaryRefinementConfig;
  /** Fallback padding (ms) for when word timestamps are unavailable */
  fallbackPadMs: number;
} {
  const preset = SILENCE_PRESETS[presetName];

  // CRITICAL: Set speechPadMs to 0 so VAD and word boundary padding don't stack.
  // Word boundary refinement (Layer 2) handles ALL padding via prePadMs/postPadMs.
  // The preset's speechPadMs is used as fallback only when word timestamps are unavailable.
  const vadConfig: SileroVadConfig = {
    ...DEFAULT_VAD_CONFIG,
    threshold: preset.vadThreshold,
    speechPadMs: 0,
    // VAD must report gaps shorter than the removal threshold, otherwise they
    // get bridged before gap processing ever sees them.
    // Use a low cap so even short silences are reported to Layer 3.
    minSilenceDurationMs: Math.min(preset.minSilenceToRemoveMs, 80),
  };

  const refinementConfig: RefinementConfig = {
    prePlosivePadMs: preset.prePadMs,
    postTrailingPadMs: preset.postPadMs,
    // Tiny merge distance — only combine truly overlapping segments after
    // padding. All gap sizing decisions belong in Layer 3.
    mergeGapMs: 15,
  };

  // Word boundary refinement (Layer 2) extends segments by prePadMs/postPadMs,
  // shrinking the gaps between them. Gap processing (Layer 3) must compensate
  // for this shrinkage, otherwise the effective removal threshold becomes
  // minSilenceToRemoveMs + prePadMs + postPadMs — far higher than intended.
  const totalPaddingMs = preset.prePadMs + preset.postPadMs;
  const compensatedMinSilence = Math.max(20, preset.minSilenceToRemoveMs - totalPaddingMs);

  const gapConfig: GapProcessingConfig = {
    minRetainedGapMs: preset.minRetainedGapMs,
    sentenceGapMs: preset.sentenceGapMs,
    clauseGapMs: Math.round(preset.sentenceGapMs * 0.67),
    midSentenceGapMs: Math.round(preset.minRetainedGapMs * 0.83),
    paragraphGapMs: Math.round(preset.sentenceGapMs * 1.33),
    maxGapMs: 500,
    minSilenceToRemoveMs: compensatedMinSilence,
    breathHandling: preset.breathHandling,
  };

  const boundaryConfig: BoundaryRefinementConfig = {
    ...DEFAULT_BOUNDARY_CONFIG,
    crossfadeMs: 20,
  };

  return { vadConfig, refinementConfig, gapConfig, boundaryConfig, fallbackPadMs: preset.speechPadMs };
}

/**
 * Validate a preset name, defaulting to 'natural' if invalid
 */
export function validatePresetName(name: string | undefined | null): SilencePresetName {
  if (name && name in SILENCE_PRESETS) {
    return name as SilencePresetName;
  }
  return 'natural';
}
