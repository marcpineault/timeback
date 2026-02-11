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
// Audio-level filler detection
// ---------------------------------------------------------------------------

async function detectFillerSoundsFromAudio(
  videoPath: string,
  outputDir: string,
): Promise<Array<{ start: number; end: number; duration: number }>> {
  console.log('[Speech Correction] Analyzing audio for filler sounds...');

  const audioPath = path.join(outputDir, `temp_audio_analysis_${Date.now()}.wav`);

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

    // Use spawn with array args to prevent command injection
    const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
      const ffmpegArgs = ['-i', audioPath, '-af', 'silencedetect=noise=-40dB:d=0.08', '-f', 'null', '-'];
      const proc = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
      let stdoutData = '';
      let stderrData = '';
      proc.stdout?.on('data', (data: Buffer) => { stdoutData += data.toString(); });
      proc.stderr?.on('data', (data: Buffer) => { stderrData += data.toString(); });
      proc.on('close', () => resolve({ stdout: stdoutData + stderrData }));
      proc.on('error', reject);
    });

    // Parse silence detection output
    const silenceStarts: number[] = [];
    const silenceEnds: number[] = [];

    for (const line of stdout.split('\n')) {
      const startMatch = line.match(/silence_start: ([\d.]+)/);
      const endMatch = line.match(/silence_end: ([\d.]+)/);
      if (startMatch) silenceStarts.push(parseFloat(startMatch[1]));
      if (endMatch) silenceEnds.push(parseFloat(endMatch[1]));
    }

    console.log(`[Speech Correction] Found ${silenceStarts.length} silence starts, ${silenceEnds.length} silence ends`);

    // Find short speech segments between silences — these could be filler sounds
    const potentialFillers: Array<{ start: number; end: number; duration: number }> = [];

    if (silenceStarts.length > 0 && silenceStarts[0] > 0.12) {
      const duration = silenceStarts[0];
      if (duration >= 0.1 && duration <= 0.9) {
        potentialFillers.push({ start: 0, end: silenceStarts[0], duration });
      }
    }

    for (let i = 0; i < silenceEnds.length; i++) {
      const speechStart = silenceEnds[i];
      const nextSilenceIdx = silenceStarts.findIndex(s => s > speechStart);
      const speechEnd = nextSilenceIdx >= 0 ? silenceStarts[nextSilenceIdx] : null;

      if (speechEnd !== null && speechEnd > speechStart) {
        const duration = speechEnd - speechStart;
        if (duration >= 0.1 && duration <= 0.8) {
          potentialFillers.push({ start: speechStart, end: speechEnd, duration });
        }
      }
    }

    // Detect closely spaced short segments (stutters)
    const stutterCandidates: Array<{ start: number; end: number; duration: number }> = [];
    for (let i = 0; i < potentialFillers.length - 1; i++) {
      const current = potentialFillers[i];
      const next = potentialFillers[i + 1];
      if (next.start - current.end < 0.15 && current.duration < 0.3 && next.duration < 0.3) {
        stutterCandidates.push(current);
      }
    }

    const allFillers = [...potentialFillers, ...stutterCandidates];
    const uniqueFillers = allFillers.filter((filler, index, self) =>
      index === self.findIndex(f => Math.abs(f.start - filler.start) < 0.05),
    );

    console.log(`[Speech Correction] Found ${uniqueFillers.length} potential filler sounds from audio analysis`);

    // Clean up
    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    return uniqueFillers;
  } catch (error) {
    console.error('[Speech Correction] Audio analysis failed:', error);
    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Correlate audio fillers with transcript
// ---------------------------------------------------------------------------

function correlateAudioFillersWithTranscript(
  audioFillers: Array<{ start: number; end: number; duration: number }>,
  words: TranscriptionWord[],
  fillerConfig: FillerWordConfig,
): SpeechMistake[] {
  const mistakes: SpeechMistake[] = [];

  for (const filler of audioFillers) {
    const overlappingWords = words.filter(
      w =>
        (w.start >= filler.start - 0.1 && w.start <= filler.end + 0.1) ||
        (w.end >= filler.start - 0.1 && w.end <= filler.end + 0.1) ||
        (w.start <= filler.start && w.end >= filler.end),
    );

    if (overlappingWords.length > 0) {
      const fillerWord = overlappingWords.find(w => getFillerTier(w.word, fillerConfig) > 0);

      if (fillerWord) {
        const tier = getFillerTier(fillerWord.word, fillerConfig);
        // Use the widest boundary between audio detection and Whisper.
        // Audio silence-detection finds exact sound boundaries; Whisper
        // word timestamps can be off by 100-200ms. Taking the wider span
        // ensures we capture the full filler sound.
        mistakes.push({
          type: 'filler_word',
          startTime: Math.min(fillerWord.start, filler.start),
          endTime: Math.max(fillerWord.end, filler.end),
          text: fillerWord.word,
          reason: 'Audio-confirmed filler word',
          // Audio-confirmed Tier 1 gets highest confidence
          confidence: tier === 1 ? 0.95 : tier === 2 ? 0.80 : 0.65,
        });
      } else {
        const text = overlappingWords.map(w => w.word).join(' ');
        if (overlappingWords.length <= 2 && filler.duration < 0.8) {
          mistakes.push({
            type: 'filler_word',
            startTime: filler.start,
            endTime: filler.end,
            text: text || '[hesitation]',
            reason: 'Audio-detected hesitation sound',
            confidence: 0.40,
          });
        }
      }
    } else {
      // No overlapping words — gap in transcription
      if (filler.duration >= 0.15 && filler.duration <= 0.6) {
        mistakes.push({
          type: 'filler_word',
          startTime: filler.start,
          endTime: filler.end,
          text: '[filler sound]',
          reason: 'Audio-detected filler (not in transcript)',
          confidence: 0.35,
        });
      }
    }
  }

  return mistakes;
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
          // Tier 1: always flag
          shouldFlag = true;
          confidence = 0.85;
        } else if (tier === 2) {
          // Tier 2: flag with light context check
          // "like" needs special handling
          if (normalized === 'like') {
            const verbContexts = ['i', 'you', 'we', 'they', 'would', 'dont', 'didnt', 'do'];
            const comparisonContexts = ['looks', 'look', 'sounds', 'sound', 'feels', 'feel', 'seems', 'seem'];
            if (verbContexts.includes(prevWord) || comparisonContexts.includes(prevWord)) continue;
            if (['this', 'that', 'a', 'the'].includes(nextWord)) continue;
          }
          // Flag if preceded or followed by a pause > 0.3s, or word is short (< 0.3s)
          shouldFlag = gapBefore > 0.3 || gapAfter > 0.3 || wordDuration < 0.3;
          confidence = 0.65;
        } else if (tier === 3) {
          // Tier 3: only flag with strong evidence
          // Need a significant gap (> 0.5s) on at least one side
          if (normalized === 'so' || normalized === 'well') {
            shouldFlag = i === 0 || gapBefore > 0.5;
          } else {
            shouldFlag = gapBefore > 0.5 && gapAfter > 0.3;
          }
          confidence = 0.50;
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

    // ── 3. Stutter detection ────────────────────────────────────────
    if (i > 0) {
      const prevNormalized = normalizeWord(words[i - 1].word);

      if (
        prevNormalized.length >= 1 &&
        prevNormalized.length < normalized.length &&
        (normalized.startsWith(prevNormalized) ||
          (prevNormalized.length <= 3 && normalized.substring(0, 2) === prevNormalized.substring(0, 2)))
      ) {
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
      ? 'Be thorough — remove anything that sounds like a speech mistake.'
      : config.aggressiveness === 'conservative'
        ? 'Be very conservative — only remove things that are clearly mistakes.'
        : 'Remove clear mistakes but preserve natural speech rhythm.';

  const systemPrompt = `You clean up spoken transcripts by removing speech mistakes.

Remove ONLY:
${removalTypes.join('\n')}

Rules:
- Use ONLY words from the original — never add, rephrase, or reorder words
- Only REMOVE words, never insert new ones
- Keep all meaningful content intact
- For self-corrections, keep the CORRECTED version (the second attempt)
- For false starts, keep the completed thought
- ${aggressivenessNote}

Return ONLY the cleaned transcript text. No explanations, no formatting, no quotes around it.`;

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

  // Speech correction needs tight, aggressive cuts:
  //
  //  cutPadding = 0.15  — Eat 150ms of dead air on each side of the filler.
  //                        Compensates for Whisper timestamp imprecision (~100-200ms)
  //                        and trims natural pauses that bracket filler words. Without
  //                        this, both pauses are preserved and concatenated, creating
  //                        a noticeable gap at every cut point.
  //
  //  timebackPadding = 0  — No keep-segment expansion. The 20ms audio micro-fades
  //                          in the FFmpeg filter handle smooth transitions. Any
  //                          timeback padding reclaims cut area and loosens the edit.
  const segments = calculateSegmentsToKeep(mistakes, duration, confidenceThreshold, 0.15, 0, 0);

  if (segments.length === 0) {
    throw new Error('No segments to keep after corrections — this would result in an empty video');
  }

  if (segments.length === 1 && segments[0].start === 0 && Math.abs(segments[0].end - duration) < 0.1) {
    console.log('[Speech Correction] No corrections needed, copying file');
    fs.copyFileSync(inputPath, outputPath);
    return { outputPath, segmentsRemoved: 0, timeRemoved: 0 };
  }

  // Build filter complex with audio micro-fades to eliminate clicks at edit points
  const AUDIO_FADE_MS = 0.02; // 20ms micro-fade — inaudible but eliminates pops
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
  console.log('[Speech Correction] Starting full speech correction pipeline...');
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

  // Step 1 + 2: Run audio analysis and transcript detection in PARALLEL
  console.log('[Speech Correction] Running audio analysis and transcript detection in parallel...');

  const [audioFillerMistakes, transcriptMistakes] = await Promise.all([
    // Audio-level filler detection
    config.removeFillerWords
      ? detectFillerSoundsFromAudio(inputPath, outputDir).then(audioFillers =>
          correlateAudioFillersWithTranscript(audioFillers, words, fillerConfig),
        )
      : Promise.resolve([] as SpeechMistake[]),

    // Transcript-based detection (programmatic + GPT)
    detectSpeechMistakes(words, config, fillerConfig),
  ]);

  console.log(
    `[Speech Correction] Audio: ${audioFillerMistakes.length} detections, Transcript: ${transcriptMistakes.length} detections`,
  );

  // Step 3: Merge with confidence boosting for multi-signal detections
  const allMistakes = [...transcriptMistakes];

  for (const audioMistake of audioFillerMistakes) {
    const overlappingIdx = allMistakes.findIndex(
      existing =>
        Math.abs(audioMistake.startTime - existing.startTime) < 0.2 ||
        (audioMistake.startTime >= existing.startTime - 0.1 && audioMistake.startTime <= existing.endTime + 0.1),
    );

    if (overlappingIdx >= 0) {
      // Audio confirms transcript detection — boost confidence and widen
      // boundaries to the union. Audio silence-detection gives precise
      // sound boundaries; Whisper word timestamps can be off by 100-200ms.
      const existing = allMistakes[overlappingIdx];
      existing.confidence = Math.min(0.95, existing.confidence + 0.10);
      existing.startTime = Math.min(existing.startTime, audioMistake.startTime);
      existing.endTime = Math.max(existing.endTime, audioMistake.endTime);
      existing.reason += ' (audio-confirmed)';
    } else {
      allMistakes.push(audioMistake);
    }
  }

  allMistakes.sort((a, b) => a.startTime - b.startTime);

  const aboveThreshold = allMistakes.filter(m => m.confidence >= confidenceThreshold).length;
  console.log(
    `[Speech Correction] Total: ${allMistakes.length} mistakes, ${aboveThreshold} above threshold (${confidenceThreshold.toFixed(2)})`,
  );

  if (aboveThreshold === 0) {
    console.log('[Speech Correction] No mistakes above confidence threshold, copying file');
    fs.copyFileSync(inputPath, outputPath);
    return { outputPath, mistakes: allMistakes, segmentsRemoved: 0, timeRemoved: 0 };
  }

  // Step 4: Apply corrections
  console.log('[Speech Correction] Applying corrections...');
  const result = await applySpeechCorrections(inputPath, outputPath, allMistakes, undefined, confidenceThreshold);

  return {
    outputPath: result.outputPath,
    mistakes: allMistakes,
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
