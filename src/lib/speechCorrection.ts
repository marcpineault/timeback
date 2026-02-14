import OpenAI from 'openai';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { TranscriptionWord } from './whisper';
import { safeFFprobe } from './ffmpeg';
import { runFFmpegWithRetry, FFmpegProcessError, FFmpegProcessConfig } from './ffmpegProcess';
import { getFillerConfig, getFillerTier, FillerWordConfig } from './fillerWords';

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }
  return new OpenAI({ apiKey });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MistakeType =
  | 'repeated_word'
  | 'filler_word'
  | 'false_start'
  | 'self_correction'
  | 'stutter'
  | 'repeated_phrase';

export interface SpeechMistake {
  type: MistakeType;
  startTime: number;
  endTime: number;
  text: string;
  reason: string;
  /** 0.0–1.0 confidence that this is a genuine mistake. */
  confidence: number;
}

export interface SpeechCorrectionConfig {
  removeFillerWords: boolean;
  removeRepeatedWords: boolean;
  removeRepeatedPhrases: boolean;
  removeFalseStarts: boolean;
  removeSelfCorrections: boolean;
  aggressiveness: 'conservative' | 'moderate' | 'aggressive';
  /** Minimum confidence to auto-apply a correction. Defaults vary by aggressiveness. */
  confidenceThreshold: number;
  /** ISO language code or 'auto'. Defaults to 'auto'. */
  language: string;
  /** User-defined extra filler words. */
  customFillerWords: string[];
  /** User-defined extra filler phrases. */
  customFillerPhrases: string[];
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export interface SpeechCorrectionPreset {
  name: string;
  description: string;
  config: Omit<SpeechCorrectionConfig, 'language' | 'customFillerWords' | 'customFillerPhrases'>;
}

export const SPEECH_CORRECTION_PRESETS: Record<string, SpeechCorrectionPreset> = {
  minimal: {
    name: 'Minimal',
    description: 'Only obvious fillers (um, uh) and repeated words',
    config: {
      removeFillerWords: true,
      removeRepeatedWords: true,
      removeRepeatedPhrases: false,
      removeFalseStarts: false,
      removeSelfCorrections: false,
      aggressiveness: 'conservative',
      confidenceThreshold: 0.80,
    },
  },
  professional: {
    name: 'Professional',
    description: 'All fillers, repeated words, and false starts',
    config: {
      removeFillerWords: true,
      removeRepeatedWords: true,
      removeRepeatedPhrases: true,
      removeFalseStarts: true,
      removeSelfCorrections: false,
      aggressiveness: 'moderate',
      confidenceThreshold: 0.60,
    },
  },
  broadcast: {
    name: 'Broadcast',
    description: 'Maximum cleanup — everything including self-corrections',
    config: {
      removeFillerWords: true,
      removeRepeatedWords: true,
      removeRepeatedPhrases: true,
      removeFalseStarts: true,
      removeSelfCorrections: true,
      aggressiveness: 'aggressive',
      confidenceThreshold: 0.40,
    },
  },
};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Default confidence thresholds per aggressiveness level */
const AGGRESSIVENESS_THRESHOLDS: Record<string, number> = {
  conservative: 0.80,
  moderate: 0.60,
  aggressive: 0.40,
};

export const DEFAULT_SPEECH_CORRECTION_CONFIG: SpeechCorrectionConfig = {
  removeFillerWords: true,
  removeRepeatedWords: true,
  removeRepeatedPhrases: true,
  removeFalseStarts: true,
  removeSelfCorrections: true,
  aggressiveness: 'moderate',
  confidenceThreshold: 0.60,
  language: 'auto',
  customFillerWords: [],
  customFillerPhrases: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^a-zà-ÿ0-9]/g, '');
}

// ---------------------------------------------------------------------------
// Silence map: adaptive threshold + speech-band filter
//
// Replaces the old audio filler detection. Instead of trying to identify
// which audio segments "sound like fillers", we build a full map of all
// silence intervals. This map is then used to snap detected mistake
// boundaries to natural silence edges for clean cuts.
// ---------------------------------------------------------------------------

interface SilenceInterval {
  start: number;
  end: number;
}

async function buildSilenceMap(
  videoPath: string,
  outputDir: string,
): Promise<SilenceInterval[]> {
  console.log('[Speech Correction] Building silence map with adaptive threshold...');

  const audioPath = path.join(outputDir, `temp_silence_map_${Date.now()}.wav`);

  try {
    // Extract audio as WAV for analysis
    await new Promise<void>((resolve, reject) => {
      ffmpeg(videoPath)
        .noVideo()
        .audioCodec('pcm_s16le')
        .audioFrequency(16000)
        .audioChannels(1)
        .output(audioPath)
        .on('end', () => resolve())
        .on('error', reject)
        .run();
    });

    // Step 1: Analyze audio levels with speech-band filter to compute
    // adaptive threshold. Uses the same approach as silence removal.
    const statsOutput = await new Promise<string>((resolve, reject) => {
      const proc = spawn('ffmpeg', [
        '-i', audioPath,
        '-af', 'highpass=f=200,lowpass=f=6000,astats=metadata=1:reset=1',
        '-f', 'null', '-',
      ], { stdio: ['pipe', 'pipe', 'pipe'] });
      let stderr = '';
      proc.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });
      proc.on('close', () => resolve(stderr));
      proc.on('error', reject);
    });

    // Parse RMS and peak levels from astats output
    let rmsLevel = -30;
    let peakLevel = -10;
    const rmsMatch = statsOutput.match(/RMS level dB:\s*([-\d.]+)/);
    const peakMatch = statsOutput.match(/Peak level dB:\s*([-\d.]+)/);
    if (rmsMatch) rmsLevel = parseFloat(rmsMatch[1]);
    if (peakMatch) peakLevel = parseFloat(peakMatch[1]);

    const dynamicRange = peakLevel - rmsLevel;

    // Adaptive threshold calculation:
    // - Noisy audio (DR < 10dB): threshold closer to speech level
    // - Clean audio (DR >= 10dB): threshold well below speech
    let silenceThreshold: number;
    if (dynamicRange < 10) {
      silenceThreshold = rmsLevel + (dynamicRange * 0.3);
    } else {
      silenceThreshold = rmsLevel - 3;
    }
    silenceThreshold = Math.max(-50, Math.min(-15, silenceThreshold));

    console.log(
      `[Speech Correction] Audio: peak=${peakLevel.toFixed(1)}dB, RMS=${rmsLevel.toFixed(1)}dB, ` +
      `DR=${dynamicRange.toFixed(1)}dB → silence threshold=${silenceThreshold.toFixed(1)}dB`,
    );

    // Step 2: Run silence detection with speech-band filter.
    // Minimum duration 0.05s (50ms) — catches the micro-silences that
    // naturally bracket filler words.
    const silenceOutput = await new Promise<string>((resolve, reject) => {
      const proc = spawn('ffmpeg', [
        '-i', audioPath,
        '-af', `highpass=f=200,lowpass=f=6000,silencedetect=noise=${silenceThreshold}dB:d=0.05`,
        '-f', 'null', '-',
      ], { stdio: ['pipe', 'pipe', 'pipe'] });
      let stderr = '';
      proc.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });
      proc.on('close', () => resolve(stderr));
      proc.on('error', reject);
    });

    // Parse silence intervals
    const silences: SilenceInterval[] = [];
    let currentStart: number | null = null;
    for (const line of silenceOutput.split('\n')) {
      const startMatch = line.match(/silence_start: ([\d.]+)/);
      const endMatch = line.match(/silence_end: ([\d.]+)/);
      if (startMatch) currentStart = parseFloat(startMatch[1]);
      if (endMatch && currentStart !== null) {
        silences.push({ start: currentStart, end: parseFloat(endMatch[1]) });
        currentStart = null;
      }
    }

    console.log(`[Speech Correction] Silence map: ${silences.length} intervals found`);

    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    return silences;
  } catch (error) {
    console.error('[Speech Correction] Silence map build failed:', error);
    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Audio energy validation: compare per-word RMS energy against context
//
// Filler words tend to have lower energy than surrounding speech. By
// measuring the RMS energy of each detected mistake region and comparing
// it to the local speech energy, we can boost confidence for likely fillers
// and reduce confidence for false positives that have normal speech energy.
// ---------------------------------------------------------------------------

interface EnergyRegion {
  start: number;
  end: number;
  rmsDb: number;
}

/**
 * Analyze RMS energy for specific time regions of the audio.
 * Returns the RMS dB level for each requested region.
 *
 * Uses a single FFmpeg pass with the `astats` filter on small segments
 * to avoid spawning many processes.
 */
async function analyzeRegionEnergy(
  videoPath: string,
  regions: Array<{ start: number; end: number }>,
  outputDir: string,
): Promise<EnergyRegion[]> {
  if (regions.length === 0) return [];

  const audioPath = path.join(outputDir, `temp_energy_${Date.now()}.wav`);
  const results: EnergyRegion[] = [];

  try {
    // Extract audio as WAV for analysis (reuse speech band filter)
    await new Promise<void>((resolve, reject) => {
      ffmpeg(videoPath)
        .noVideo()
        .audioCodec('pcm_s16le')
        .audioFrequency(16000)
        .audioChannels(1)
        .output(audioPath)
        .on('end', () => resolve())
        .on('error', reject)
        .run();
    });

    // Analyze each region individually (batch up to 8 concurrent)
    const batchSize = 8;
    for (let b = 0; b < regions.length; b += batchSize) {
      const batch = regions.slice(b, b + batchSize);

      const batchResults = await Promise.all(
        batch.map(async (region) => {
          const duration = region.end - region.start;
          if (duration < 0.02) return { ...region, rmsDb: -60 };

          return new Promise<EnergyRegion>((resolve) => {
            const proc = spawn('ffmpeg', [
              '-i', audioPath,
              '-ss', String(region.start),
              '-t', String(duration),
              '-af', 'highpass=f=200,lowpass=f=6000,astats=measure_perchannel=RMS_level:measure_overall=RMS_level',
              '-f', 'null', '-',
            ], { stdio: ['pipe', 'pipe', 'pipe'] });
            let stderr = '';
            proc.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });
            proc.on('close', () => {
              const rmsMatch = stderr.match(/RMS level dB:\s*([-\d.]+)/);
              resolve({
                ...region,
                rmsDb: rmsMatch ? parseFloat(rmsMatch[1]) : -60,
              });
            });
            proc.on('error', () => resolve({ ...region, rmsDb: -60 }));
          });
        }),
      );
      results.push(...batchResults);
    }

    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    return results;
  } catch (error) {
    console.error('[Speech Correction] Energy analysis failed:', error);
    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    return regions.map(r => ({ ...r, rmsDb: -60 }));
  }
}

/**
 * Validate detected mistakes using audio energy analysis.
 *
 * Compares the RMS energy of each mistake region against the median speech
 * energy. Fillers typically have lower energy than surrounding speech,
 * so we:
 *  - BOOST confidence when energy is significantly lower than speech (+0.08)
 *  - REDUCE confidence when energy matches normal speech levels (−0.10)
 *  - Leave confidence unchanged for borderline cases
 *
 * Only applies to filler_word and stutter types (other types like
 * repeated_word are validated by text patterns, not energy).
 */
async function validateWithAudioEnergy(
  mistakes: SpeechMistake[],
  videoPath: string,
  outputDir: string,
  words: TranscriptionWord[],
): Promise<void> {
  // Only validate filler words and stutters — energy is most discriminative for these
  const energyRelevant = mistakes.filter(
    m => m.type === 'filler_word' || m.type === 'stutter',
  );
  if (energyRelevant.length === 0) return;

  // Build regions: each mistake + surrounding context
  const mistakeRegions = energyRelevant.map(m => ({
    start: m.startTime,
    end: m.endTime,
  }));

  // Also sample some non-mistake speech regions for baseline
  const contextRegions: Array<{ start: number; end: number }> = [];
  const sortedWords = [...words].sort((a, b) => a.start - b.start);
  const mistakeTimeSet = new Set(energyRelevant.map(m => `${m.startTime.toFixed(3)}`));

  // Pick up to 10 speech words NOT in mistake regions for baseline
  let sampled = 0;
  for (const w of sortedWords) {
    if (sampled >= 10) break;
    if (w.end - w.start < 0.1) continue; // Too short to measure
    if (mistakeTimeSet.has(`${w.start.toFixed(3)}`)) continue;

    // Check this word isn't inside any mistake region
    const inMistake = energyRelevant.some(
      m => w.start >= m.startTime - 0.05 && w.end <= m.endTime + 0.05,
    );
    if (inMistake) continue;

    contextRegions.push({ start: w.start, end: w.end });
    sampled++;
  }

  if (contextRegions.length < 3) {
    console.log('[Speech Correction] Not enough context words for energy validation, skipping');
    return;
  }

  // Analyze energy for all regions
  const allRegions = [...mistakeRegions, ...contextRegions];
  const energyResults = await analyzeRegionEnergy(videoPath, allRegions, outputDir);

  if (energyResults.length === 0) return;

  // Calculate baseline speech energy (median of context regions)
  const contextEnergies = energyResults
    .slice(mistakeRegions.length)
    .map(r => r.rmsDb)
    .filter(e => e > -55) // Filter out silence/very quiet
    .sort((a, b) => a - b);

  if (contextEnergies.length === 0) return;

  const medianSpeechEnergy = contextEnergies[Math.floor(contextEnergies.length / 2)];

  console.log(
    `[Speech Correction] Energy validation: speech baseline=${medianSpeechEnergy.toFixed(1)}dB ` +
    `(${contextEnergies.length} samples), validating ${energyRelevant.length} mistakes`,
  );

  // Compare each mistake's energy to the baseline
  for (let i = 0; i < energyRelevant.length; i++) {
    const mistake = energyRelevant[i];
    const energy = energyResults[i];
    const energyDiff = energy.rmsDb - medianSpeechEnergy;

    if (energyDiff < -6) {
      // Significantly quieter than speech — strong filler signal
      const boost = 0.08;
      mistake.confidence = Math.min(0.95, mistake.confidence + boost);
      mistake.reason += ` [energy: ${energyDiff.toFixed(1)}dB, boosted]`;
    } else if (energyDiff > -2 && mistake.confidence < 0.80) {
      // Energy matches normal speech — less likely to be a filler
      const penalty = 0.10;
      mistake.confidence = Math.max(0.20, mistake.confidence - penalty);
      mistake.reason += ` [energy: ${energyDiff.toFixed(1)}dB, reduced]`;
    }
  }
}

// ---------------------------------------------------------------------------
// Snap mistake boundaries to nearest silence edges
//
// For each detected mistake, expand its start/end into the surrounding
// silence intervals. This ensures cuts happen at natural silence points
// rather than relying on imprecise Whisper word timestamps + padding.
// ---------------------------------------------------------------------------

function snapToSilenceBoundaries(
  mistakes: SpeechMistake[],
  silenceMap: SilenceInterval[],
): void {
  if (silenceMap.length === 0) return;

  // Keep 30ms of silence at each edit point for natural word spacing
  const KEEP_SILENCE = 0.03;
  // Search range: look for silence within ±200ms of mistake boundaries
  // (wider than before to find better cut points)
  const SEARCH_RANGE = 0.20;

  for (const mistake of mistakes) {
    // Find silence interval closest to and overlapping/adjacent to mistake start
    let preSilence: SilenceInterval | null = null;
    let postSilence: SilenceInterval | null = null;
    let bestPreDist = Infinity;
    let bestPostDist = Infinity;

    for (const silence of silenceMap) {
      // Pre-silence: silence that ends near mistake start and starts before it
      // The silence should end close to where the mistake begins
      if (
        silence.end >= mistake.startTime - SEARCH_RANGE &&
        silence.start < mistake.startTime + 0.05
      ) {
        const dist = Math.abs(silence.end - mistake.startTime);
        if (dist < bestPreDist) {
          bestPreDist = dist;
          preSilence = silence;
        }
      }

      // Post-silence: silence that starts near mistake end and extends after it
      // The silence should start close to where the mistake ends
      if (
        silence.start <= mistake.endTime + SEARCH_RANGE &&
        silence.end > mistake.endTime - 0.05
      ) {
        const dist = Math.abs(silence.start - mistake.endTime);
        if (dist < bestPostDist) {
          bestPostDist = dist;
          postSilence = silence;
        }
      }
    }

    // Snap start: expand backward into pre-silence, keeping a tiny gap
    if (preSilence) {
      const newStart = preSilence.start + KEEP_SILENCE;
      // Only expand if the silence is actually before or overlapping the mistake
      if (newStart < mistake.startTime + 0.05) {
        mistake.startTime = newStart;
      }
    }

    // Snap end: expand forward into post-silence, keeping a tiny gap
    if (postSilence) {
      const newEnd = postSilence.end - KEEP_SILENCE;
      // Only expand if the silence is actually after or overlapping the mistake
      if (newEnd > mistake.endTime - 0.05) {
        mistake.endTime = newEnd;
      }
    }

    // Safety: ensure start < end
    if (mistake.startTime >= mistake.endTime) {
      mistake.endTime = mistake.startTime + 0.05;
    }
  }
}

// ---------------------------------------------------------------------------
// Repeated phrase detection
// ---------------------------------------------------------------------------

function detectRepeatedPhrases(
  words: TranscriptionWord[],
  commonPhrasesToSkip: Set<string>,
  minPhraseLength = 2,
  maxPhraseLength = 5,
): SpeechMistake[] {
  const mistakes: SpeechMistake[] = [];

  for (let phraseLen = maxPhraseLength; phraseLen >= minPhraseLength; phraseLen--) {
    for (let i = 0; i <= words.length - phraseLen * 2; i++) {
      const phrase1Words = words.slice(i, i + phraseLen);
      const phrase1Text = phrase1Words.map(w => normalizeWord(w.word)).join(' ');

      if (commonPhrasesToSkip.has(phrase1Text)) continue;
      if (phrase1Text.replace(/\s/g, '').length < 4) continue;

      const meaningfulWords = phrase1Words.filter(w => {
        const norm = normalizeWord(w.word);
        return (
          norm.length > 2 &&
          !['the', 'a', 'an', 'i', 'you', 'we', 'he', 'she', 'it', 'they', 'to', 'of', 'in', 'on', 'at', 'is', 'are', 'was', 'were', 'be', 'been', 'and', 'or', 'but', 'so', 'for', 'with', 'that', 'this'].includes(norm)
        );
      });
      if (meaningfulWords.length < 1) continue;

      const phrase2StartIdx = i + phraseLen;
      if (phrase2StartIdx + phraseLen > words.length) continue;

      const phrase2Words = words.slice(phrase2StartIdx, phrase2StartIdx + phraseLen);
      const phrase2Text = phrase2Words.map(w => normalizeWord(w.word)).join(' ');

      if (phrase1Text === phrase2Text) {
        const gapBetweenPhrases = phrase2Words[0].start - phrase1Words[phrase1Words.length - 1].end;

        if (gapBetweenPhrases >= 0 && gapBetweenPhrases < 0.5) {
          const alreadyMarked = mistakes.some(
            m =>
              (m.startTime <= phrase1Words[0].start && m.endTime >= phrase1Words[phraseLen - 1].end) ||
              (phrase1Words[0].start <= m.startTime && phrase1Words[phraseLen - 1].end >= m.startTime),
          );

          if (!alreadyMarked) {
            const originalText = phrase1Words.map(w => w.word).join(' ');
            mistakes.push({
              type: 'repeated_phrase',
              startTime: phrase1Words[0].start,
              endTime: phrase1Words[phraseLen - 1].end,
              text: originalText,
              reason: `Repeated phrase "${originalText}" — removing first occurrence`,
              confidence: 0.85,
            });
          }
        }
      }
    }
  }

  return mistakes;
}

// ---------------------------------------------------------------------------
// Programmatic pre-detection (tiered fillers + confidence)
// ---------------------------------------------------------------------------

function preDetectMistakes(
  words: TranscriptionWord[],
  config: SpeechCorrectionConfig,
  fillerConfig: FillerWordConfig,
): SpeechMistake[] {
  const mistakes: SpeechMistake[] = [];

  // Build custom filler sets
  const customFillers = new Set(config.customFillerWords.map(w => w.toLowerCase().trim()).filter(Boolean));

  console.log('[Speech Correction] Running programmatic pre-detection (tiered)...');

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const normalized = normalizeWord(word.word);
    if (!normalized) continue;

    // ── 1. Filler word detection (tiered) ───────────────────────────
    if (config.removeFillerWords) {
      const tier = getFillerTier(word.word, fillerConfig);
      const isCustomFiller = customFillers.has(normalized);

      if (tier > 0 || isCustomFiller) {
        const prevWord = i > 0 ? normalizeWord(words[i - 1].word) : '';
        const nextWord = i < words.length - 1 ? normalizeWord(words[i + 1].word) : '';
        const gapBefore = i > 0 ? word.start - words[i - 1].end : 999;
        const gapAfter = i < words.length - 1 ? words[i + 1].start - word.end : 999;
        const wordDuration = word.end - word.start;

        let shouldFlag = false;
        let confidence = 0;

        if (isCustomFiller) {
          // Custom fillers: trust the user
          shouldFlag = true;
          confidence = 0.85;
        } else if (tier === 1) {
          // Tier 1: always flag — these are never real words
          shouldFlag = true;
          confidence = 0.90;
        } else if (tier === 2) {
          // Tier 2: flag with light context check
          // "like" needs special handling
          if (normalized === 'like') {
            const verbContexts = ['i', 'you', 'we', 'they', 'would', 'dont', 'didnt', 'do'];
            const comparisonContexts = ['looks', 'look', 'sounds', 'sound', 'feels', 'feel', 'seems', 'seem'];
            if (verbContexts.includes(prevWord) || comparisonContexts.includes(prevWord)) continue;
            if (['this', 'that', 'a', 'the'].includes(nextWord)) continue;
          }
          // Flag if preceded or followed by a pause > 0.15s, or word is short (< 0.4s)
          shouldFlag = gapBefore > 0.15 || gapAfter > 0.15 || wordDuration < 0.4;
          confidence = 0.70;
        } else if (tier === 3) {
          // Tier 3: flag with moderate evidence
          if (normalized === 'so' || normalized === 'well') {
            shouldFlag = i === 0 || gapBefore > 0.25;
          } else {
            shouldFlag = gapBefore > 0.25 && gapAfter > 0.15;
          }
          confidence = 0.55;
        }

        if (shouldFlag) {
          mistakes.push({
            type: 'filler_word',
            startTime: word.start,
            endTime: word.end,
            text: word.word,
            reason: isCustomFiller
              ? 'Custom filler word'
              : `Tier ${tier} filler word`,
            confidence,
          });
        }
      }
    }

    // ── 2. Repeated consecutive words ───────────────────────────────
    if (config.removeRepeatedWords && i > 0) {
      const prevNormalized = normalizeWord(words[i - 1].word);

      if (normalized === prevNormalized && normalized.length > 1) {
        const alreadyMarked = mistakes.some(
          m => m.startTime === words[i - 1].start && m.type === 'repeated_word',
        );

        if (!alreadyMarked) {
          mistakes.push({
            type: 'repeated_word',
            startTime: words[i - 1].start,
            endTime: words[i - 1].end,
            text: `${words[i - 1].word} ${word.word}`,
            reason: 'Repeated word — removing first occurrence',
            confidence: 0.90,
          });
        }
      }
    }

    // ── 3. Stutter detection (enhanced) ──────────────────────────────
    if (i > 0) {
      const prevNormalized = normalizeWord(words[i - 1].word);

      // 3a. Prefix stutter: "w" → "want", "th" → "the"
      if (
        prevNormalized.length >= 1 &&
        prevNormalized.length < normalized.length &&
        (normalized.startsWith(prevNormalized) ||
          (prevNormalized.length <= 3 && normalized.substring(0, 2) === prevNormalized.substring(0, 2)))
      ) {
        const alreadyMarked = mistakes.some(
          m => m.startTime === words[i - 1].start && (m.type === 'stutter' || m.type === 'repeated_word'),
        );
        if (!alreadyMarked) {
          mistakes.push({
            type: 'stutter',
            startTime: words[i - 1].start,
            endTime: words[i - 1].end,
            text: words[i - 1].word,
            reason: `Stutter before "${word.word}"`,
            confidence: 0.80,
          });
        }
      }

      // 3b. Multi-step stutter: "I I I want" — detect runs of 3+ identical short words
      // (pair repetitions are caught in section 2, but 3+ runs deserve higher confidence)
      if (i >= 2 && config.removeRepeatedWords) {
        const prevPrevNorm = normalizeWord(words[i - 2].word);
        if (normalized === prevNormalized && normalized === prevPrevNorm && normalized.length <= 3) {
          // This is a 3+ stutter run — mark all but the last with high confidence
          // Check how far back the run extends
          let runStart = i - 2;
          while (runStart > 0 && normalizeWord(words[runStart - 1].word) === normalized) {
            runStart--;
          }
          for (let k = runStart; k < i; k++) {
            const alreadyMarked = mistakes.some(
              m => m.startTime === words[k].start && (m.type === 'stutter' || m.type === 'repeated_word'),
            );
            if (!alreadyMarked) {
              mistakes.push({
                type: 'stutter',
                startTime: words[k].start,
                endTime: words[k].end,
                text: words[k].word,
                reason: `Stutter run (${i - runStart + 1}x "${word.word}")`,
                confidence: 0.92,
              });
            }
          }
        }
      }

      // 3c. Broken stutter with gap: "th" [pause] "the" — short word, gap < 0.4s, next word starts same
      if (
        prevNormalized.length <= 3 &&
        prevNormalized.length >= 1 &&
        normalized.length > prevNormalized.length &&
        normalized.startsWith(prevNormalized.substring(0, Math.min(2, prevNormalized.length)))
      ) {
        const gap = word.start - words[i - 1].end;
        if (gap > 0 && gap < 0.4) {
          const alreadyMarked = mistakes.some(
            m => m.startTime === words[i - 1].start && (m.type === 'stutter' || m.type === 'repeated_word'),
          );
          if (!alreadyMarked) {
            mistakes.push({
              type: 'stutter',
              startTime: words[i - 1].start,
              endTime: words[i - 1].end,
              text: words[i - 1].word,
              reason: `Broken stutter: "${words[i - 1].word}" → "${word.word}" (gap ${(gap * 1000).toFixed(0)}ms)`,
              confidence: 0.75,
            });
          }
        }
      }
    }
  }

  // ── 4. Multi-word filler phrases ──────────────────────────────────
  if (config.removeFillerWords) {
    const allPhrases = [...fillerConfig.fillerPhrases, ...config.customFillerPhrases];
    const fullText = words.map(w => normalizeWord(w.word)).join(' ');

    for (const phrase of allPhrases) {
      const normalizedPhrase = phrase.toLowerCase().replace(/[^a-zà-ÿ0-9 ]/g, '');
      let searchStart = 0;

      while (true) {
        const phraseIndex = fullText.indexOf(normalizedPhrase, searchStart);
        if (phraseIndex === -1) break;

        let charCount = 0;
        let startWordIndex = -1;
        let endWordIndex = -1;

        for (let j = 0; j < words.length; j++) {
          const wordEnd = charCount + normalizeWord(words[j].word).length;

          if (startWordIndex === -1 && wordEnd > phraseIndex) startWordIndex = j;
          if (wordEnd >= phraseIndex + normalizedPhrase.length) {
            endWordIndex = j;
            break;
          }
          charCount = wordEnd + 1;
        }

        if (startWordIndex !== -1 && endWordIndex !== -1) {
          const phraseText = words.slice(startWordIndex, endWordIndex + 1).map(w => w.word).join(' ');
          const alreadyDetected = mistakes.some(
            m => m.startTime === words[startWordIndex].start && m.endTime === words[endWordIndex].end,
          );

          if (!alreadyDetected) {
            const isCustom = config.customFillerPhrases.some(
              p => p.toLowerCase().replace(/[^a-zà-ÿ0-9 ]/g, '') === normalizedPhrase,
            );
            mistakes.push({
              type: 'filler_word',
              startTime: words[startWordIndex].start,
              endTime: words[endWordIndex].end,
              text: phraseText,
              reason: isCustom ? `Custom filler phrase: "${phrase}"` : `Filler phrase: "${phrase}"`,
              confidence: isCustom ? 0.85 : 0.70,
            });
          }
        }

        searchStart = phraseIndex + 1;
      }
    }
  }

  // ── 5. Repeated phrases ───────────────────────────────────────────
  if (config.removeRepeatedPhrases) {
    const repeatedPhrases = detectRepeatedPhrases(words, fillerConfig.commonPhrasesToSkip);
    for (const phrase of repeatedPhrases) {
      const alreadyDetected = mistakes.some(
        m =>
          (phrase.startTime >= m.startTime && phrase.startTime <= m.endTime) ||
          (phrase.endTime >= m.startTime && phrase.endTime <= m.endTime),
      );
      if (!alreadyDetected) mistakes.push(phrase);
    }
  }

  // ── 6. Self-correction patterns ─────────────────────────────────
  // Detect patterns like: "go left, I mean right" or "Tuesday, sorry, Wednesday"
  // The corrected part (before the signal) should be removed, keeping the correction.
  if (config.removeSelfCorrections) {
    // Correction signal phrases to look for
    const correctionSignals: Array<{ words: string[]; label: string }> = [
      { words: ['i', 'mean'], label: 'I mean' },
      { words: ['i', 'meant'], label: 'I meant' },
      { words: ['or', 'rather'], label: 'or rather' },
      { words: ['well', 'actually'], label: 'well actually' },
      { words: ['no', 'wait'], label: 'no wait' },
    ];
    // Single-word correction signals (need tighter context)
    const singleSignals = ['sorry', 'actually', 'wait'];

    for (let i = 0; i < words.length; i++) {
      const norm = normalizeWord(words[i].word);

      // Check two-word signals first
      for (const signal of correctionSignals) {
        if (
          norm === signal.words[0] &&
          i + 1 < words.length &&
          normalizeWord(words[i + 1].word) === signal.words[1]
        ) {
          // Found a correction signal — look backward for the incorrect part
          // Go back up to 4 words, stopping at a long gap (> 0.5s) or sentence boundary
          let corrStart = i - 1;
          if (corrStart < 0) break;

          while (corrStart > 0) {
            const gap = words[corrStart].start - words[corrStart - 1].end;
            if (gap > 0.5) break;
            if (i - corrStart >= 4) break;
            corrStart--;
          }

          if (corrStart < i) {
            const corrText = words.slice(corrStart, i).map(w => w.word).join(' ');
            const signalText = words.slice(i, i + signal.words.length).map(w => w.word).join(' ');
            const alreadyDetected = mistakes.some(
              m => m.startTime >= words[corrStart].start - 0.05 && m.startTime <= words[i].start + 0.05,
            );
            if (!alreadyDetected) {
              mistakes.push({
                type: 'self_correction',
                startTime: words[corrStart].start,
                endTime: words[i + signal.words.length - 1].end,
                text: `${corrText} ${signalText}`,
                reason: `Self-correction with "${signal.label}" — keeping the corrected version`,
                confidence: 0.65,
              });
            }
          }
          i += signal.words.length - 1; // Skip signal words
          break;
        }
      }

      // Check single-word signals (need a gap or filler before them to confirm)
      if (singleSignals.includes(norm) && i > 0 && i < words.length - 1) {
        const gapBefore = words[i].start - words[i - 1].end;
        const gapAfter = i + 1 < words.length ? words[i + 1].start - words[i].end : 999;

        // Only flag if there's a brief pause context (speaker pauses to correct)
        if (gapBefore > 0.1 || gapAfter > 0.1) {
          // Look backward for what's being corrected (1-3 words)
          let corrStart = i - 1;
          while (corrStart > 0 && i - corrStart < 3) {
            const gap = words[corrStart].start - words[corrStart - 1].end;
            if (gap > 0.5) break;
            corrStart--;
          }

          if (corrStart < i) {
            const corrText = words.slice(corrStart, i).map(w => w.word).join(' ');
            const alreadyDetected = mistakes.some(
              m => m.startTime >= words[corrStart].start - 0.05 && m.startTime <= words[i].start + 0.05,
            );
            if (!alreadyDetected) {
              mistakes.push({
                type: 'self_correction',
                startTime: words[corrStart].start,
                endTime: words[i].end,
                text: `${corrText} ${words[i].word}`,
                reason: `Self-correction with "${words[i].word}" — keeping the corrected version`,
                confidence: 0.55, // Lower confidence for single-word signals
              });
            }
          }
        }
      }
    }
  }

  // ── 7. False start detection ────────────────────────────────────
  // Detect abandoned thoughts: short phrase → pause → completely different continuation
  // Only flag with low confidence — GPT confirmation will boost.
  if (config.removeFalseStarts) {
    for (let i = 0; i < words.length - 1; i++) {
      const gap = words[i + 1].start - words[i].end;

      // Need a meaningful gap (0.3s+) that suggests the speaker paused to restart
      if (gap < 0.3) continue;

      // Find the start of the current phrase (backward from i)
      let phraseStart = i;
      while (phraseStart > 0) {
        const prevGap = words[phraseStart].start - words[phraseStart - 1].end;
        if (prevGap > 0.4) break;
        phraseStart--;
      }

      const phraseLen = i - phraseStart + 1;

      // Only consider short phrases (1-4 words) as potential false starts
      // Longer phrases are more likely to be complete thoughts
      if (phraseLen < 1 || phraseLen > 4) continue;

      // Skip if the phrase is a common sentence opener that's intentional
      const phraseText = words.slice(phraseStart, i + 1).map(w => normalizeWord(w.word)).join(' ');
      if (fillerConfig.commonPhrasesToSkip.has(phraseText)) continue;

      // Check that the next phrase starts differently (not a continuation)
      const nextWord = normalizeWord(words[i + 1].word);
      const phraseFirstWord = normalizeWord(words[phraseStart].word);

      // If next phrase starts with same word, this could be a restart (caught by repeated phrases)
      if (nextWord === phraseFirstWord) continue;

      // Skip if this phrase already overlaps with a detected mistake
      const alreadyDetected = mistakes.some(
        m =>
          (words[phraseStart].start >= m.startTime && words[phraseStart].start <= m.endTime) ||
          (words[i].end >= m.startTime && words[i].end <= m.endTime),
      );
      if (alreadyDetected) continue;

      // Additional check: phrase should contain at least one content word
      const hasContentWord = words.slice(phraseStart, i + 1).some(w => {
        const n = normalizeWord(w.word);
        return n.length > 2 && !['the', 'a', 'an', 'i', 'to', 'of', 'in', 'on', 'is', 'it'].includes(n);
      });

      if (hasContentWord && phraseLen >= 2) {
        // Flag with low confidence — needs GPT confirmation
        const originalText = words.slice(phraseStart, i + 1).map(w => w.word).join(' ');
        mistakes.push({
          type: 'false_start',
          startTime: words[phraseStart].start,
          endTime: words[i].end,
          text: originalText,
          reason: `Possible false start: "${originalText}" followed by ${(gap * 1000).toFixed(0)}ms pause`,
          confidence: 0.45, // Low confidence — relies on GPT to confirm/boost
        });
      }
    }
  }

  console.log(`[Speech Correction] Pre-detection found ${mistakes.length} mistakes`);
  return mistakes;
}

// ---------------------------------------------------------------------------
// LCS-based diff: find which original words were removed in cleaned version
//
// Instead of asking GPT to identify mistake indices (error-prone), we ask
// GPT-4o to return the cleaned transcript, then use LCS diff to find which
// words were removed. This leverages what LLMs are good at (understanding
// intent) rather than what they're bad at (precise index picking).
// ---------------------------------------------------------------------------

function findRemovedWordIndices(
  originalWords: TranscriptionWord[],
  cleanedText: string,
): Set<number> {
  const cleanedTokens = cleanedText
    .split(/\s+/)
    .map(w => w.toLowerCase().replace(/[^a-zà-ÿ0-9']/g, ''))
    .filter(Boolean);

  const origTokens = originalWords.map(w =>
    w.word.toLowerCase().replace(/[^a-zà-ÿ0-9']/g, ''),
  );

  const n = origTokens.length;
  const m = cleanedTokens.length;

  if (m === 0) {
    console.warn('[Speech Correction] GPT returned empty cleaned text, skipping');
    return new Set();
  }

  // Build LCS DP table
  const dp: number[][] = [];
  for (let i = 0; i <= n; i++) {
    dp[i] = new Array(m + 1).fill(0);
  }

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (origTokens[i - 1] === cleanedTokens[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find which original words are in the LCS (kept)
  const keptIndices = new Set<number>();
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (origTokens[i - 1] === cleanedTokens[j - 1]) {
      keptIndices.add(i - 1);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  // Words NOT in the LCS were removed
  const removedIndices = new Set<number>();
  for (let idx = 0; idx < n; idx++) {
    if (!keptIndices.has(idx)) {
      removedIndices.add(idx);
    }
  }

  return removedIndices;
}

// ---------------------------------------------------------------------------
// GPT-based detection: clean-transcript-diff approach
// ---------------------------------------------------------------------------

const GPT_CHUNK_SIZE = 800;
const GPT_CHUNK_OVERLAP = 50;

export async function detectSpeechMistakesWithGPT(
  words: TranscriptionWord[],
  config: SpeechCorrectionConfig = DEFAULT_SPEECH_CORRECTION_CONFIG,
): Promise<SpeechMistake[]> {
  if (!words || words.length === 0) return [];

  const openai = getOpenAIClient();

  // Chunk the transcript for very long videos
  const chunks: { words: TranscriptionWord[]; offset: number }[] = [];

  if (words.length <= GPT_CHUNK_SIZE + GPT_CHUNK_OVERLAP) {
    chunks.push({ words, offset: 0 });
  } else {
    for (let start = 0; start < words.length; start += GPT_CHUNK_SIZE - GPT_CHUNK_OVERLAP) {
      const end = Math.min(start + GPT_CHUNK_SIZE, words.length);
      chunks.push({ words: words.slice(start, end), offset: start });
      if (end === words.length) break;
    }
  }

  console.log(`[Speech Correction] Analyzing ${words.length} words with GPT-4o clean-transcript-diff in ${chunks.length} chunk(s)...`);

  // Build removal instructions based on config
  const removalTypes: string[] = [];
  if (config.removeFillerWords) {
    removalTypes.push('- Filler sounds: um, uh, uhm, hmm, er, ah, and similar hesitation sounds');
  }
  if (config.removeFalseStarts) {
    removalTypes.push('- False starts: incomplete thoughts that get abandoned and restarted');
  }
  if (config.removeSelfCorrections) {
    removalTypes.push('- Self-corrections: when someone says something wrong then corrects themselves');
  }
  if (config.removeRepeatedWords) {
    removalTypes.push('- Stutters and accidental word repetitions: "the the", "I I I"');
  }
  if (config.removeRepeatedPhrases) {
    removalTypes.push('- Repeated phrases: when someone accidentally says the same phrase twice in a row');
  }

  const aggressivenessNote =
    config.aggressiveness === 'aggressive'
      ? 'Be thorough — remove anything that sounds like a speech mistake, including verbal tics and discourse markers used as fillers.'
      : config.aggressiveness === 'conservative'
        ? 'Be very conservative — only remove things that are clearly and unambiguously mistakes. When in doubt, keep the word.'
        : 'Remove clear mistakes but preserve natural speech rhythm. Remove fillers that disrupt flow but keep ones that serve as intentional transitions.';

  const systemPrompt = `You are an expert speech editor. Clean up this spoken transcript by removing speech mistakes while preserving the speaker's intended message and natural flow.

Remove ONLY these types of speech mistakes:
${removalTypes.join('\n')}

CRITICAL RULES:
1. Use ONLY words from the original — NEVER add, rephrase, or reorder words
2. Only REMOVE words, never insert new ones
3. Keep ALL meaningful content and intentional speech intact
4. For self-corrections ("go left, I mean right"), remove the INCORRECT part and the correction signal ("go left, I mean"), keeping "right"
5. For false starts, remove the abandoned thought and keep the completed version
6. For repeated words/phrases, keep ONLY ONE occurrence (the later one if they differ slightly)
7. NEVER remove words that serve a grammatical or semantic purpose in their sentence
8. "Like" is a filler ONLY when used as a pause word, NOT when used as a verb ("I like"), comparison ("looks like"), or conjunction ("like I said")
9. "So" is a filler ONLY at the very start of a thought or after a long pause, NOT when used as a conjunction connecting clauses
10. "Actually" is a filler when used as a hedge, but NOT when it contrasts or corrects ("it's actually blue, not green")

${aggressivenessNote}

Examples of correct cleaning:
- "Um so like basically the thing is" → "the thing is"
- "I went to the the store" → "I went to the store"
- "Go left, I mean, go right at the light" → "go right at the light"
- "I think, I think we should" → "I think we should"
- "The revenue was like honestly really good" → "The revenue was really good"
- "So yeah, we basically, we need to focus" → "we need to focus"

Examples of what to KEEP (do NOT remove):
- "I like this product" (like = verb)
- "It looks like rain" (like = comparison)
- "So we need to act fast" (so = conjunction starting a conclusion)
- "It was actually quite good" (actually = meaningful contrast)
- "Right, let's move on" (right = acknowledgment starting new topic)

Return ONLY the cleaned transcript text with no explanation, no formatting, no quotes.`;

  // Process chunks (in parallel for speed)
  const chunkResults = await Promise.all(
    chunks.map(async (chunk) => {
      const transcriptText = chunk.words.map(w => w.word).join(' ');

      try {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: transcriptText },
          ],
          temperature: 0.1,
        });

        const cleanedText = response.choices[0].message.content?.trim() || '';

        if (!cleanedText) {
          console.warn('[Speech Correction] GPT returned empty response for chunk');
          return { removedIndices: new Set<number>(), offset: chunk.offset, size: chunk.words.length };
        }

        const removedIndices = findRemovedWordIndices(chunk.words, cleanedText);
        console.log(
          `[Speech Correction] Chunk (offset ${chunk.offset}): ${removedIndices.size}/${chunk.words.length} words removed`,
        );

        return { removedIndices, offset: chunk.offset, size: chunk.words.length };
      } catch (error) {
        console.error('[Speech Correction] GPT chunk error:', error);
        return { removedIndices: new Set<number>(), offset: chunk.offset, size: chunk.words.length };
      }
    }),
  );

  // Collect all removed word indices (adjusting for chunk offsets)
  const globalRemovedIndices = new Set<number>();
  for (const result of chunkResults) {
    for (const localIdx of result.removedIndices) {
      globalRemovedIndices.add(localIdx + result.offset);
    }
  }

  // For overlap regions, require consensus (both chunks must agree to remove)
  if (chunks.length > 1) {
    for (let c = 0; c < chunks.length - 1; c++) {
      const currentEnd = chunks[c].offset + chunks[c].words.length;
      const nextStart = chunks[c + 1].offset;
      for (let idx = nextStart; idx < currentEnd; idx++) {
        const inCurrent = chunkResults[c].removedIndices.has(idx - chunks[c].offset);
        const inNext = chunkResults[c + 1].removedIndices.has(idx - chunks[c + 1].offset);
        if (inCurrent !== inNext) {
          // Disagreement in overlap — be conservative, keep the word
          globalRemovedIndices.delete(idx);
        }
      }
    }
  }

  // Group consecutive removed words into SpeechMistake objects
  const fillerConfig = getFillerConfig(config.language === 'auto' ? 'en' : config.language);
  const sortedRemoved = Array.from(globalRemovedIndices).sort((a, b) => a - b);

  const groups: Array<{ start: number; end: number }> = [];
  let currentGroup: { start: number; end: number } | null = null;

  for (const idx of sortedRemoved) {
    if (!currentGroup) {
      currentGroup = { start: idx, end: idx };
    } else if (idx <= currentGroup.end + 1) {
      // Consecutive or adjacent — extend group
      currentGroup.end = idx;
    } else {
      groups.push(currentGroup);
      currentGroup = { start: idx, end: idx };
    }
  }
  if (currentGroup) groups.push(currentGroup);

  // Convert groups to SpeechMistake objects with classification
  const mistakes: SpeechMistake[] = [];

  for (const group of groups) {
    if (group.start >= words.length || group.end >= words.length) continue;

    const groupWords = words.slice(group.start, group.end + 1);
    const text = groupWords.map(w => w.word).join(' ');

    // Classify the mistake type
    let type: MistakeType = 'false_start';
    let reason = 'Speech mistake removed by AI';
    let confidence = 0.80;

    const allFillers = groupWords.every(w => getFillerTier(w.word, fillerConfig) >= 1);

    if (allFillers) {
      type = 'filler_word';
      reason = groupWords.length === 1 ? 'Filler sound' : 'Filler words';
      confidence = 0.90;
    } else if (groupWords.length === 1) {
      const tier = getFillerTier(groupWords[0].word, fillerConfig);
      if (tier >= 1) {
        type = 'filler_word';
        reason = 'Filler word';
        confidence = 0.85;
      } else {
        // Check if it's a repeated word by looking at neighbors
        const nextIdx = group.end + 1;
        const prevIdx = group.start - 1;
        const norm = normalizeWord(groupWords[0].word);
        if (nextIdx < words.length && normalizeWord(words[nextIdx].word) === norm) {
          type = 'repeated_word';
          reason = 'Repeated word';
          confidence = 0.85;
        } else if (prevIdx >= 0 && normalizeWord(words[prevIdx].word) === norm) {
          type = 'repeated_word';
          reason = 'Repeated word';
          confidence = 0.85;
        } else {
          type = 'self_correction';
          reason = 'Speech mistake';
          confidence = 0.75;
        }
      }
    } else {
      // Multi-word removal — false start or self-correction
      type = 'false_start';
      reason = 'False start or self-correction';
      confidence = 0.80;
    }

    mistakes.push({
      type,
      startTime: words[group.start].start,
      endTime: words[group.end].end,
      text,
      reason,
      confidence,
    });
  }

  console.log(`[Speech Correction] GPT clean-transcript-diff detected ${mistakes.length} mistakes`);
  return mistakes;
}

// ---------------------------------------------------------------------------
// Confidence refinement: silence proximity + clustering + position
//
// Post-processing step that adjusts confidence scores based on contextual
// signals beyond the text level:
//  1. Silence proximity: mistakes bracketed by silence are more likely real
//  2. Clustering: multiple fillers near each other boost each other
//  3. Sentence position: fillers at start/end of clauses are more common
// ---------------------------------------------------------------------------

function refineConfidenceScores(
  mistakes: SpeechMistake[],
  silenceMap: SilenceInterval[],
  words: TranscriptionWord[],
): void {
  if (mistakes.length === 0) return;

  // 1. Silence proximity: if a filler/stutter is bracketed by silence
  //    within ±150ms, it's more likely a genuine mistake
  if (silenceMap.length > 0) {
    for (const mistake of mistakes) {
      let hasSilenceBefore = false;
      let hasSilenceAfter = false;

      for (const silence of silenceMap) {
        // Silence ending near or overlapping mistake start
        if (silence.end >= mistake.startTime - 0.15 && silence.end <= mistake.startTime + 0.05) {
          hasSilenceBefore = true;
        }
        // Silence starting near or overlapping mistake end
        if (silence.start >= mistake.endTime - 0.05 && silence.start <= mistake.endTime + 0.15) {
          hasSilenceAfter = true;
        }
      }

      if (hasSilenceBefore && hasSilenceAfter) {
        // Fully bracketed by silence — strong signal
        mistake.confidence = Math.min(0.95, mistake.confidence + 0.06);
        mistake.reason += ' [silence-bracketed]';
      } else if (hasSilenceBefore || hasSilenceAfter) {
        // Partially bracketed — mild signal
        mistake.confidence = Math.min(0.95, mistake.confidence + 0.03);
      }
    }
  }

  // 2. Clustering: multiple mistakes within 2 seconds of each other
  //    suggest a "disfluency cluster" — boost all in the cluster
  const sortedByTime = [...mistakes].sort((a, b) => a.startTime - b.startTime);
  for (let i = 0; i < sortedByTime.length; i++) {
    const current = sortedByTime[i];
    let clusterSize = 1;

    // Count nearby mistakes (within 2s window)
    for (let j = i + 1; j < sortedByTime.length; j++) {
      if (sortedByTime[j].startTime - current.endTime <= 2.0) {
        clusterSize++;
      } else {
        break;
      }
    }

    // Boost confidence for all mistakes in clusters of 3+
    if (clusterSize >= 3) {
      for (let j = i; j < i + clusterSize && j < sortedByTime.length; j++) {
        sortedByTime[j].confidence = Math.min(0.95, sortedByTime[j].confidence + 0.05);
      }
    } else if (clusterSize === 2) {
      // Small boost for pairs
      for (let j = i; j < i + clusterSize && j < sortedByTime.length; j++) {
        sortedByTime[j].confidence = Math.min(0.95, sortedByTime[j].confidence + 0.02);
      }
    }
  }

  // 3. Sentence position: fillers at the very start of speech (first 2 words)
  //    or right after a long gap (>0.5s) are very likely genuine fillers
  for (const mistake of mistakes) {
    if (mistake.type !== 'filler_word') continue;

    // Check if this filler is at the start of the transcript
    const isVeryFirst = words.length > 0 && Math.abs(mistake.startTime - words[0].start) < 0.1;

    // Check if this filler follows a long pause
    let followsLongPause = false;
    for (const w of words) {
      if (Math.abs(w.start - mistake.startTime) < 0.05) {
        // Found the matching word — check gap before it
        const wordIdx = words.indexOf(w);
        if (wordIdx > 0) {
          const gap = w.start - words[wordIdx - 1].end;
          if (gap > 0.5) followsLongPause = true;
        }
        break;
      }
    }

    if (isVeryFirst || followsLongPause) {
      mistake.confidence = Math.min(0.95, mistake.confidence + 0.05);
      if (isVeryFirst) mistake.reason += ' [sentence-start]';
      if (followsLongPause) mistake.reason += ' [after-pause]';
    }
  }
}

// ---------------------------------------------------------------------------
// Combined detection: programmatic + GPT (with confidence merging)
// ---------------------------------------------------------------------------

export async function detectSpeechMistakes(
  words: TranscriptionWord[],
  config: SpeechCorrectionConfig = DEFAULT_SPEECH_CORRECTION_CONFIG,
  fillerConfig: FillerWordConfig = getFillerConfig('en'),
): Promise<SpeechMistake[]> {
  if (!words || words.length === 0) return [];

  console.log(`[Speech Correction] Starting combined detection for ${words.length} words...`);

  // Step 1: Programmatic pre-detection (fast, reliable)
  const programmaticMistakes = preDetectMistakes(words, config, fillerConfig);

  // Step 2: GPT-based detection (catches context-dependent mistakes)
  const gptMistakes = await detectSpeechMistakesWithGPT(words, config);

  // Step 3: Merge with confidence boosting
  const allMistakes = [...programmaticMistakes];

  for (const gptMistake of gptMistakes) {
    // Check for overlap with programmatic detections
    const overlappingIdx = allMistakes.findIndex(
      existing =>
        (gptMistake.startTime >= existing.startTime && gptMistake.startTime <= existing.endTime) ||
        (gptMistake.endTime >= existing.startTime && gptMistake.endTime <= existing.endTime) ||
        (gptMistake.startTime <= existing.startTime && gptMistake.endTime >= existing.endTime),
    );

    if (overlappingIdx >= 0) {
      // Both systems agree — boost confidence
      const existing = allMistakes[overlappingIdx];
      existing.confidence = Math.min(0.95, Math.max(existing.confidence, gptMistake.confidence) + 0.10);
      existing.reason += ' (GPT-confirmed)';
    } else {
      // GPT-only detection
      allMistakes.push(gptMistake);
    }
  }

  // Sort by start time
  allMistakes.sort((a, b) => a.startTime - b.startTime);

  console.log(`[Speech Correction] Total combined mistakes: ${allMistakes.length}`);
  allMistakes.forEach((m, i) => {
    console.log(
      `  ${i + 1}. [${m.type}] "${m.text}" (${m.startTime.toFixed(2)}s–${m.endTime.toFixed(2)}s) conf=${m.confidence.toFixed(2)}: ${m.reason}`,
    );
  });

  return allMistakes;
}

// ---------------------------------------------------------------------------
// Calculate segments to keep
// ---------------------------------------------------------------------------

export function calculateSegmentsToKeep(
  mistakes: SpeechMistake[],
  totalDuration: number,
  confidenceThreshold: number,
  padding = 0.03,
  timebackPadding = 0.25,
  timebackPaddingEnd = 0.2,
): Array<{ start: number; end: number }> {
  // Filter mistakes below confidence threshold
  const confidentMistakes = mistakes.filter(m => m.confidence >= confidenceThreshold);

  if (confidentMistakes.length === 0) {
    return [{ start: 0, end: totalDuration }];
  }

  console.log(
    `[Speech Correction] ${confidentMistakes.length}/${mistakes.length} mistakes above confidence threshold ${confidenceThreshold.toFixed(2)}`,
  );

  const sortedMistakes = [...confidentMistakes].sort((a, b) => a.startTime - b.startTime);

  // Merge overlapping/adjacent cuts
  const mergedCuts: Array<{ start: number; end: number }> = [];
  for (const mistake of sortedMistakes) {
    const cutStart = Math.max(0, mistake.startTime - padding);
    const cutEnd = Math.min(totalDuration, mistake.endTime + padding);

    if (mergedCuts.length === 0) {
      mergedCuts.push({ start: cutStart, end: cutEnd });
    } else {
      const lastCut = mergedCuts[mergedCuts.length - 1];
      if (cutStart <= lastCut.end + 0.05) {
        lastCut.end = Math.max(lastCut.end, cutEnd);
      } else {
        mergedCuts.push({ start: cutStart, end: cutEnd });
      }
    }
  }

  // Calculate inverse (segments to keep)
  const segmentsToKeep: Array<{ start: number; end: number }> = [];
  let lastEnd = 0;
  for (const cut of mergedCuts) {
    if (cut.start > lastEnd) segmentsToKeep.push({ start: lastEnd, end: cut.start });
    lastEnd = cut.end;
  }
  if (lastEnd < totalDuration) segmentsToKeep.push({ start: lastEnd, end: totalDuration });

  // Filter out very short segments (< 50ms)
  const filteredSegments = segmentsToKeep.filter(seg => seg.end - seg.start >= 0.05);

  // Apply timeback padding (asymmetric)
  const paddedSegments = filteredSegments.map(seg => ({
    start: Math.max(0, seg.start - timebackPadding),
    end: Math.min(totalDuration, seg.end + timebackPaddingEnd),
  }));

  // Merge overlapping after padding
  const finalSegments: Array<{ start: number; end: number }> = [];
  for (const seg of paddedSegments) {
    if (finalSegments.length === 0) {
      finalSegments.push({ ...seg });
    } else {
      const last = finalSegments[finalSegments.length - 1];
      if (seg.start <= last.end) {
        last.end = Math.max(last.end, seg.end);
      } else {
        finalSegments.push({ ...seg });
      }
    }
  }

  console.log(`[Speech Correction] Keeping ${finalSegments.length} segments:`);
  finalSegments.forEach((seg, i) => {
    console.log(`  Segment ${i + 1}: ${seg.start.toFixed(2)}s–${seg.end.toFixed(2)}s (${(seg.end - seg.start).toFixed(2)}s)`);
  });

  const totalKept = finalSegments.reduce((sum, seg) => sum + (seg.end - seg.start), 0);
  console.log(
    `[Speech Correction] Duration: ${totalDuration.toFixed(2)}s → ${totalKept.toFixed(2)}s (cut ${(totalDuration - totalKept).toFixed(2)}s)`,
  );

  return finalSegments;
}

// ---------------------------------------------------------------------------
// Apply corrections with audio micro-fades and improved encoding
// ---------------------------------------------------------------------------

export async function applySpeechCorrections(
  inputPath: string,
  outputPath: string,
  mistakes: SpeechMistake[],
  totalDuration?: number,
  confidenceThreshold = 0.60,
): Promise<{ outputPath: string; segmentsRemoved: number; timeRemoved: number }> {
  let duration = totalDuration;
  if (!duration) {
    const metadata = await safeFFprobe(inputPath);
    duration = metadata.format.duration || 0;
  }

  console.log(`[Speech Correction] Applying corrections to video (duration: ${duration.toFixed(2)}s)`);

  // Mistake boundaries are already silence-snapped by snapToSilenceBoundaries(),
  // so we only need minimal padding (5ms) to avoid sub-sample edge artifacts.
  // No timeback padding — cuts are aligned to natural silence points.
  const segments = calculateSegmentsToKeep(mistakes, duration, confidenceThreshold, 0.005, 0, 0);

  if (segments.length === 0) {
    throw new Error('No segments to keep after corrections — this would result in an empty video');
  }

  if (segments.length === 1 && segments[0].start === 0 && Math.abs(segments[0].end - duration) < 0.1) {
    console.log('[Speech Correction] No corrections needed, copying file');
    fs.copyFileSync(inputPath, outputPath);
    return { outputPath, segmentsRemoved: 0, timeRemoved: 0 };
  }

  // Build filter complex with audio micro-fades to eliminate clicks at edit points
  const AUDIO_FADE_MS = 0.03; // 30ms micro-fade — inaudible but eliminates pops
  const filterParts: string[] = [];
  const concatInputs: string[] = [];

  segments.forEach((segment, index) => {
    const segDuration = segment.end - segment.start;

    // Video: trim only
    filterParts.push(
      `[0:v]trim=start=${segment.start}:end=${segment.end},setpts=PTS-STARTPTS[v${index}]`,
    );

    // Audio: trim + micro-fades at each edit boundary to prevent clicks/pops
    const fadeOutStart = Math.max(0, segDuration - AUDIO_FADE_MS);
    filterParts.push(
      `[0:a]atrim=start=${segment.start}:end=${segment.end},asetpts=PTS-STARTPTS,afade=t=in:d=${AUDIO_FADE_MS},afade=t=out:st=${fadeOutStart.toFixed(4)}:d=${AUDIO_FADE_MS}[a${index}]`,
    );

    concatInputs.push(`[v${index}][a${index}]`);
  });

  const filterComplex = [
    ...filterParts,
    `${concatInputs.join('')}concat=n=${segments.length}:v=1:a=1[outv][outa]`,
  ].join(';');

  console.log(`[Speech Correction] Processing ${segments.length} segments with audio micro-fades...`);

  const processConfig: FFmpegProcessConfig = {
    timeout: 5 * 60 * 1000,
    maxRetries: 1,
    context: 'Speech Correction',
  };

  try {
    await runFFmpegWithRetry(() => {
      return ffmpeg(inputPath)
        .complexFilter(filterComplex)
        .outputOptions([
          '-map', '[outv]',
          '-map', '[outa]',
          '-c:v', 'libx264',
          '-preset', 'fast',       // Better quality than ultrafast
          '-crf', '22',            // Better quality than 28
          '-threads', '2',
          '-max_muxing_queue_size', '512',
          '-bufsize', '2M',
          '-movflags', '+faststart', // Better streaming compatibility
          '-c:a', 'aac',
          '-b:a', '128k',           // Higher quality audio (was 96k)
        ])
        .output(outputPath);
    }, processConfig);

    const totalKept = segments.reduce((sum, seg) => sum + (seg.end - seg.start), 0);
    const timeRemoved = duration - totalKept;
    const confidentCount = mistakes.filter(m => m.confidence >= confidenceThreshold).length;
    console.log(`[Speech Correction] Complete! Removed ${timeRemoved.toFixed(2)}s from ${confidentCount} corrections`);
    return { outputPath, segmentsRemoved: confidentCount, timeRemoved };
  } catch (err) {
    if (err instanceof FFmpegProcessError) {
      if (err.isMemoryKill) {
        throw new Error('Speech correction failed due to memory constraints. Try a shorter video or disable some options.');
      }
      if (err.isTimeout) {
        throw new Error('Speech correction timed out. The video may be too long.');
      }
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Full pipeline: detect + apply
// ---------------------------------------------------------------------------

export async function correctSpeechMistakes(
  inputPath: string,
  outputPath: string,
  words: TranscriptionWord[],
  config: SpeechCorrectionConfig = DEFAULT_SPEECH_CORRECTION_CONFIG,
): Promise<{
  outputPath: string;
  mistakes: SpeechMistake[];
  segmentsRemoved: number;
  timeRemoved: number;
}> {
  console.log('[Speech Correction] Starting full speech correction pipeline (enhanced)...');
  console.log(`[Speech Correction] Config: ${JSON.stringify(config)}`);

  const outputDir = path.dirname(outputPath);

  // Resolve language config
  const fillerConfig = getFillerConfig(config.language === 'auto' ? 'en' : config.language);
  console.log(`[Speech Correction] Using ${fillerConfig.name} filler word config`);

  // Resolve confidence threshold (use config value, or fall back to aggressiveness default)
  const confidenceThreshold =
    config.confidenceThreshold > 0
      ? config.confidenceThreshold
      : AGGRESSIVENESS_THRESHOLDS[config.aggressiveness] || 0.60;

  // Step 1: Build silence map AND run transcript detection in PARALLEL.
  // The silence map gives us precise audio boundaries for cutting;
  // transcript detection identifies WHICH words to remove.
  console.log('[Speech Correction] Building silence map and running detection in parallel...');

  const [silenceMap, transcriptMistakes] = await Promise.all([
    buildSilenceMap(inputPath, outputDir),
    detectSpeechMistakes(words, config, fillerConfig),
  ]);

  console.log(
    `[Speech Correction] Detection: ${transcriptMistakes.length} mistakes, Silence map: ${silenceMap.length} intervals`,
  );

  // Step 2: Refine confidence scores using contextual signals.
  // This uses silence proximity, clustering, and position to adjust
  // confidence scores before applying the threshold filter.
  console.log('[Speech Correction] Refining confidence scores with contextual signals...');
  refineConfidenceScores(transcriptMistakes, silenceMap, words);

  // Step 2.5: Audio energy validation — validate filler/stutter detections
  // by comparing their audio energy to surrounding speech levels.
  // Runs in parallel with nothing (it's a quick analysis), but after
  // detection so we only analyze already-detected regions.
  console.log('[Speech Correction] Validating detections with audio energy analysis...');
  try {
    await validateWithAudioEnergy(transcriptMistakes, inputPath, outputDir, words);
  } catch (energyError) {
    // Non-fatal — continue without energy validation
    console.warn('[Speech Correction] Audio energy validation failed, continuing without:', energyError);
  }

  // Step 3: Filter by confidence threshold (after refinement)
  const allMistakes = transcriptMistakes.filter(m => m.confidence >= confidenceThreshold);

  console.log(
    `[Speech Correction] ${allMistakes.length}/${transcriptMistakes.length} mistakes above threshold (${confidenceThreshold.toFixed(2)})`,
  );

  if (allMistakes.length === 0) {
    console.log('[Speech Correction] No mistakes above confidence threshold, copying file');
    fs.copyFileSync(inputPath, outputPath);
    return { outputPath, mistakes: transcriptMistakes, segmentsRemoved: 0, timeRemoved: 0 };
  }

  // Step 4: Snap mistake boundaries to silence edges.
  // This replaces the old fixed-padding approach. Instead of cutting at
  // Whisper word timestamps ± arbitrary ms, we expand each cut into the
  // surrounding silence intervals for clean, natural-sounding edits.
  snapToSilenceBoundaries(allMistakes, silenceMap);

  // Log final cut plan
  allMistakes.sort((a, b) => a.startTime - b.startTime);
  console.log('[Speech Correction] Cut plan after silence-snapping:');
  allMistakes.forEach((m, i) => {
    console.log(
      `  ${i + 1}. [${m.type}] "${m.text}" (${m.startTime.toFixed(2)}s–${m.endTime.toFixed(2)}s) conf=${m.confidence.toFixed(2)}: ${m.reason}`,
    );
  });

  // Step 5: Apply corrections
  console.log('[Speech Correction] Applying corrections...');
  const result = await applySpeechCorrections(inputPath, outputPath, allMistakes, undefined, confidenceThreshold);

  return {
    outputPath: result.outputPath,
    mistakes: transcriptMistakes,
    segmentsRemoved: result.segmentsRemoved,
    timeRemoved: result.timeRemoved,
  };
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

export function generateCorrectionReport(mistakes: SpeechMistake[]): string {
  if (mistakes.length === 0) return 'No speech mistakes detected.';

  const grouped: Record<string, SpeechMistake[]> = {};
  for (const mistake of mistakes) {
    if (!grouped[mistake.type]) grouped[mistake.type] = [];
    grouped[mistake.type].push(mistake);
  }

  let report = `Speech Correction Report\n${'='.repeat(50)}\n\n`;
  report += `Total mistakes found: ${mistakes.length}\n\n`;

  for (const [type, items] of Object.entries(grouped)) {
    const typeName = type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    report += `${typeName} (${items.length}):\n`;
    for (const item of items) {
      report += `  - "${item.text}" at ${item.startTime.toFixed(2)}s (confidence: ${item.confidence.toFixed(2)})\n`;
    }
    report += '\n';
  }

  const totalTime = mistakes.reduce((sum, m) => sum + (m.endTime - m.startTime), 0);
  report += `Estimated time to be removed: ${totalTime.toFixed(2)} seconds\n`;

  return report;
}
