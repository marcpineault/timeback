import { SileroVadConfig, DEFAULT_VAD_CONFIG } from './sileroVadDetection';
import { RefinementConfig, DEFAULT_REFINEMENT_CONFIG } from './hybridBoundaryRefinement';
import { GapProcessingConfig, DEFAULT_GAP_CONFIG } from './gapProcessing';
import { BoundaryRefinementConfig, DEFAULT_BOUNDARY_CONFIG } from './boundaryRefinement';

/**
 * Silence removal preset names
 */
export type SilencePresetName = 'jumpCut' | 'natural' | 'gentle';

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
 * The three editing presets that control silence removal aggressiveness
 */
export const SILENCE_PRESETS: Record<SilencePresetName, SilencePreset> = {
  jumpCut: {
    name: 'Jump Cut',
    description: 'Fast-paced, TikTok/YouTube style',
    speechPadMs: 80,
    prePadMs: 60,
    postPadMs: 80,
    minSilenceToRemoveMs: 300,
    minRetainedGapMs: 100,
    sentenceGapMs: 250,
    breathHandling: 'remove',
    vadThreshold: 0.45,
  },
  natural: {
    name: 'Natural',
    description: 'Conversational, podcast style (default)',
    speechPadMs: 120,
    prePadMs: 100,
    postPadMs: 120,
    minSilenceToRemoveMs: 500,
    minRetainedGapMs: 200,
    sentenceGapMs: 400,
    breathHandling: 'reduce',
    vadThreshold: 0.4,
  },
  gentle: {
    name: 'Gentle',
    description: 'Minimal editing, presentations/lectures',
    speechPadMs: 180,
    prePadMs: 200,
    postPadMs: 250,
    minSilenceToRemoveMs: 700,
    minRetainedGapMs: 300,
    sentenceGapMs: 600,
    breathHandling: 'keep',
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
    minSilenceDurationMs: Math.min(preset.minSilenceToRemoveMs, 300),
  };

  const refinementConfig: RefinementConfig = {
    prePlosivePadMs: preset.prePadMs,
    postTrailingPadMs: preset.postPadMs,
    // Small fixed merge distance — only combine segments that truly overlap or
    // are adjacent after padding. Content-level gap decisions belong in Layer 3.
    mergeGapMs: 80,
  };

  // Word boundary refinement (Layer 2) extends segments by prePadMs/postPadMs,
  // shrinking the gaps between them. Gap processing (Layer 3) must compensate
  // for this shrinkage, otherwise the effective removal threshold becomes
  // minSilenceToRemoveMs + prePadMs + postPadMs — far higher than intended.
  const totalPaddingMs = preset.prePadMs + preset.postPadMs;
  const compensatedMinSilence = Math.max(100, preset.minSilenceToRemoveMs - totalPaddingMs);

  const gapConfig: GapProcessingConfig = {
    minRetainedGapMs: preset.minRetainedGapMs,
    sentenceGapMs: preset.sentenceGapMs,
    clauseGapMs: Math.round(preset.sentenceGapMs * 0.67),
    midSentenceGapMs: Math.round(preset.minRetainedGapMs * 0.83),
    paragraphGapMs: Math.round(preset.sentenceGapMs * 1.33),
    maxGapMs: 2000,
    minSilenceToRemoveMs: compensatedMinSilence,
    breathHandling: preset.breathHandling,
  };

  const boundaryConfig: BoundaryRefinementConfig = {
    ...DEFAULT_BOUNDARY_CONFIG,
    crossfadeMs: presetName === 'jumpCut' ? 10 : 20,
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
