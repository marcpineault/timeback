export type { FillerWordConfig } from './types';

import enConfig from './en';
import frConfig from './fr';
import esConfig from './es';
import deConfig from './de';
import ptConfig from './pt';
import { FillerWordConfig } from './types';

const CONFIGS: Record<string, FillerWordConfig> = {
  en: enConfig,
  fr: frConfig,
  es: esConfig,
  de: deConfig,
  pt: ptConfig,
};

/** Supported language codes for filler word detection. */
export const SUPPORTED_LANGUAGES = Object.keys(CONFIGS);

/**
 * Get the filler word config for a language.
 * Falls back to English if the language is unsupported.
 */
export function getFillerConfig(language: string): FillerWordConfig {
  // Normalize: take just the primary subtag ("en-US" → "en")
  const primary = language.toLowerCase().split(/[-_]/)[0];
  return CONFIGS[primary] || CONFIGS.en;
}

/**
 * Check which tier a word belongs to for a given language.
 * Returns 0 if the word is not a filler in any tier.
 */
export function getFillerTier(
  word: string,
  config: FillerWordConfig,
): 1 | 2 | 3 | 0 {
  const normalized = word.toLowerCase().replace(/[^a-zà-ÿ0-9]/g, '');
  if (!normalized) return 0;

  if (config.tier1Fillers.has(normalized)) return 1;

  // Check regex patterns (variations like "ummmm") — always Tier 1
  for (const pattern of config.fillerPatterns) {
    if (pattern.test(normalized)) return 1;
  }

  if (config.tier2Fillers.has(normalized)) return 2;
  if (config.tier3Fillers.has(normalized)) return 3;

  return 0;
}
