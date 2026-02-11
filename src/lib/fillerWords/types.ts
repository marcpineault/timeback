/**
 * Language-specific filler word configuration.
 *
 * Words are split into three tiers based on how confidently they can be
 * classified as fillers without additional context:
 *
 *   Tier 1 — Always fillers (um, uh, hmm). Safe to remove in any context.
 *   Tier 2 — Usually fillers (basically, literally, actually). Need a light
 *            context check (e.g. preceded/followed by a pause).
 *   Tier 3 — Context-dependent (so, well, right, just). Only flag when there
 *            is strong evidence (long gap, GPT confirmation, etc.).
 */
export interface FillerWordConfig {
  /** ISO 639-1 language code */
  language: string;
  /** Human-readable language name */
  name: string;

  /** Tier 1: always fillers — safe to remove unconditionally */
  tier1Fillers: Set<string>;
  /** Tier 2: usually fillers — need light context check */
  tier2Fillers: Set<string>;
  /** Tier 3: context-dependent — need strong evidence */
  tier3Fillers: Set<string>;

  /** Regex patterns that match filler-sound variations (umm, uhhh, etc.) */
  fillerPatterns: RegExp[];

  /** Multi-word filler phrases */
  fillerPhrases: string[];

  /** Common short phrases that should NOT be flagged as repeated-phrase mistakes */
  commonPhrasesToSkip: Set<string>;
}
