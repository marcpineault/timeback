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
 *
 * Gap values (sentenceGapMs, etc.) represent the TOTAL desired silence
 * between speech segments — including the prePadMs/postPadMs padding that
 * protects word boundaries. getConfigsFromPreset() subtracts the padding
 * to compute the effective additional gap. This means:
 *   actual output silence = postPadMs + effectiveGap + prePadMs = sentenceGapMs
 */
export interface SilencePreset {
  name: string;
  description: string;
  /** Silero VAD speech padding (ms) — used as fallback when word timestamps unavailable */
  speechPadMs: number;
  /** Padding before first word to catch plosive onsets (ms) */
  prePadMs: number;
  /** Padding after last word to catch trailing consonants (ms) */
  postPadMs: number;
  /** Minimum silence duration to trigger removal (ms) */
  minSilenceToRemoveMs: number;
  /** TOTAL desired silence at sentence-ending punctuation (. ! ?) (ms) */
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
    speechPadMs: 30,
    prePadMs: 40,
    postPadMs: 70,
    minSilenceToRemoveMs: 250,
    sentenceGapMs: 160,
    breathHandling: 'remove',
    vadThreshold: 0.40,
  },
  gentle: {
    name: 'Gentle',
    description: 'Light editing, presentations/lectures — brief pauses kept',
    speechPadMs: 50,
    prePadMs: 60,
    postPadMs: 100,
    minSilenceToRemoveMs: 600,
    sentenceGapMs: 350,
    breathHandling: 'remove',
    vadThreshold: 0.35,
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

  // The total output silence at a cut = postPad + effectiveGap + prePad.
  // Preset gap values represent TOTAL desired silence, so we subtract the
  // padding that's already baked into the segments to get the effective gap.
  const totalPaddingMs = preset.prePadMs + preset.postPadMs;
  const compensatedMinSilence = Math.max(20, preset.minSilenceToRemoveMs - totalPaddingMs);

  // Compute effective gaps: total desired silence minus padding already present
  const effectiveSentenceGap = Math.max(0, preset.sentenceGapMs - totalPaddingMs);
  const effectiveClauseGap = Math.max(0, Math.round(preset.sentenceGapMs * 0.6) - totalPaddingMs);
  const effectiveMidSentenceGap = 0; // Padding alone is sufficient mid-sentence

  const gapConfig: GapProcessingConfig = {
    minRetainedGapMs: 0,
    sentenceGapMs: effectiveSentenceGap,
    clauseGapMs: effectiveClauseGap,
    midSentenceGapMs: effectiveMidSentenceGap,
    paragraphGapMs: Math.max(0, Math.round(preset.sentenceGapMs * 1.3) - totalPaddingMs),
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
