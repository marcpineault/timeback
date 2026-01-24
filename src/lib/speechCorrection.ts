import OpenAI from 'openai';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { TranscriptionWord } from './whisper';

const execAsync = promisify(exec);

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }
  return new OpenAI({ apiKey });
}

/**
 * Types of speech mistakes that can be detected
 */
export type MistakeType =
  | 'repeated_word'      // "the the", "I I"
  | 'filler_word'        // "um", "uh", "like", "you know"
  | 'false_start'        // Incomplete sentence restarts
  | 'self_correction'    // "I went to the store- I mean the mall"
  | 'stutter'            // "b-b-but", "wh-what"
  | 'repeated_phrase';   // "so basically, so basically"

/**
 * A detected speech mistake with timing information
 */
export interface SpeechMistake {
  type: MistakeType;
  startTime: number;
  endTime: number;
  text: string;
  reason: string;
}

/**
 * Configuration for speech correction
 */
export interface SpeechCorrectionConfig {
  removeFillerWords: boolean;      // Remove "um", "uh", "like" etc.
  removeRepeatedWords: boolean;    // Remove duplicate words
  removeFalseStarts: boolean;      // Remove incomplete restarts
  removeSelfCorrections: boolean;  // Remove incorrect words in corrections
  aggressiveness: 'conservative' | 'moderate' | 'aggressive';
}

/**
 * Default configuration
 */
export const DEFAULT_SPEECH_CORRECTION_CONFIG: SpeechCorrectionConfig = {
  removeFillerWords: true,
  removeRepeatedWords: true,
  removeFalseStarts: true,
  removeSelfCorrections: true,
  aggressiveness: 'moderate',
};

/**
 * Detect short audio segments that could be filler sounds (um, uh, etc.)
 * Uses FFmpeg to analyze audio and find short voiced segments
 */
async function detectFillerSoundsFromAudio(
  videoPath: string,
  outputDir: string
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

    // Use FFmpeg's silencedetect to find speech segments
    // Use lower noise threshold (-40dB) to detect quieter fillers
    // Use shorter minimum silence duration (0.08s) to catch brief pauses around fillers
    const { stdout } = await execAsync(
      `ffmpeg -i "${audioPath}" -af "silencedetect=noise=-40dB:d=0.08" -f null - 2>&1`
    );

    // Parse silence detection output
    const silenceStarts: number[] = [];
    const silenceEnds: number[] = [];

    const lines = stdout.split('\n');
    for (const line of lines) {
      const startMatch = line.match(/silence_start: ([\d.]+)/);
      const endMatch = line.match(/silence_end: ([\d.]+)/);

      if (startMatch) {
        silenceStarts.push(parseFloat(startMatch[1]));
      }
      if (endMatch) {
        silenceEnds.push(parseFloat(endMatch[1]));
      }
    }

    console.log(`[Speech Correction] Found ${silenceStarts.length} silence starts, ${silenceEnds.length} silence ends`);

    // Find short speech segments between silences
    // These could be filler sounds
    const potentialFillers: Array<{ start: number; end: number; duration: number }> = [];

    // Add implicit start at 0 if first silence doesn't start at 0
    if (silenceStarts.length > 0 && silenceStarts[0] > 0.12) {
      // There's speech at the start - check if it's short
      const duration = silenceStarts[0];
      if (duration >= 0.1 && duration <= 0.9) {
        potentialFillers.push({ start: 0, end: silenceStarts[0], duration });
      }
    }

    // Check segments between silence end and next silence start
    for (let i = 0; i < silenceEnds.length; i++) {
      const speechStart = silenceEnds[i];
      // Find the next silence start after this silence end
      const nextSilenceIdx = silenceStarts.findIndex(s => s > speechStart);
      const speechEnd = nextSilenceIdx >= 0 ? silenceStarts[nextSilenceIdx] : null;

      if (speechEnd !== null && speechEnd > speechStart) {
        const duration = speechEnd - speechStart;

        // Filler sounds are typically 0.1-0.8 seconds
        // Also check for repeated short segments (stutters)
        if (duration >= 0.1 && duration <= 0.8) {
          potentialFillers.push({ start: speechStart, end: speechEnd, duration });
        }
      }
    }

    // Also detect closely spaced short segments that might be stutters
    // Look for patterns like "I-I-I" or "th-the"
    const stutterCandidates: Array<{ start: number; end: number; duration: number }> = [];
    for (let i = 0; i < potentialFillers.length - 1; i++) {
      const current = potentialFillers[i];
      const next = potentialFillers[i + 1];

      // If two short segments are close together, might be a stutter
      if (next.start - current.end < 0.15 && current.duration < 0.3 && next.duration < 0.3) {
        // Mark the first one as a stutter candidate (we'll remove the first, keep the second)
        stutterCandidates.push(current);
      }
    }

    // Combine and deduplicate
    const allFillers = [...potentialFillers, ...stutterCandidates];
    const uniqueFillers = allFillers.filter((filler, index, self) =>
      index === self.findIndex(f => Math.abs(f.start - filler.start) < 0.05)
    );

    console.log(`[Speech Correction] Found ${uniqueFillers.length} potential filler sounds from audio analysis`);
    uniqueFillers.slice(0, 20).forEach((f, i) => {
      console.log(`  Audio filler ${i + 1}: ${f.start.toFixed(2)}s - ${f.end.toFixed(2)}s (${f.duration.toFixed(2)}s)`);
    });

    // Clean up
    if (fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
    }

    return uniqueFillers;
  } catch (error) {
    console.error('[Speech Correction] Audio analysis failed:', error);
    // Clean up on error
    if (fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
    }
    return [];
  }
}

/**
 * Common filler words and their variations (normalized to lowercase)
 * These are detected programmatically before GPT analysis
 */
const FILLER_WORD_PATTERNS: RegExp[] = [
  /^u+[hm]+$/i,           // um, uh, umm, uhh, uhhm, etc.
  /^[ae]+[hm]+$/i,        // ah, ahm, eh, ehm, etc.
  /^[hm]+m*$/i,           // hmm, hmmm, mm, mmm, hm
  /^e+r+$/i,              // er, err, errr
  /^o+h+$/i,              // oh, ohh
  /^a+h+$/i,              // ah, ahh
  /^u+h*$/i,              // uh, u, uhh (standalone)
  /^m+$/i,                // m, mm, mmm
  /^h+m+$/i,              // hm, hmm
  /^a+$/i,                // a, aa (when short duration)
  /^i+$/i,                // i (false start - "I... I...")
];

/**
 * Single filler words (exact match, case insensitive)
 */
const SINGLE_FILLER_WORDS = new Set([
  // Core filler sounds
  'um', 'uh', 'umm', 'uhh', 'uhm', 'uhhh', 'ummm', 'huh',
  'er', 'err', 'eh', 'ehh', 'erm',
  'ah', 'ahh', 'oh', 'ohh', 'ooh',
  'hmm', 'hm', 'hmmm', 'mm', 'mmm', 'mhm', 'mmhm', 'uh-huh',
  // Sentence starters often used as fillers
  'so', 'well', 'now', 'but',
  // Common filler words
  'anyway', 'anyways', 'anyhow',
  'basically', 'essentially',
  'literally', 'figuratively',
  'actually', 'technically',
  'obviously', 'clearly',
  'honestly', 'frankly',
  'really', 'totally', 'definitely',
  'just', // when overused
  'right', 'okay', 'ok', 'alright',
  'yeah', 'yep', 'yup', 'yes', 'ya', 'yah',
  'no', 'nope', 'nah', // when not answering a question
  // Hedging words
  'maybe', 'perhaps', 'probably',
]);

/**
 * Multi-word filler phrases
 */
const FILLER_PHRASES = [
  'you know',
  'i mean',
  'kind of',
  'sort of',
  'you know what',
  'like i said',
  'to be honest',
  'at the end of the day',
  'if you will',
  'so to speak',
];

/**
 * Normalize a word for comparison
 */
function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Check if a word is a filler word
 */
function isFillerWord(word: string): boolean {
  const normalized = normalizeWord(word);

  // Check exact matches
  if (SINGLE_FILLER_WORDS.has(normalized)) {
    return true;
  }

  // Check regex patterns (for variations like "uhhhhm")
  for (const pattern of FILLER_WORD_PATTERNS) {
    if (pattern.test(normalized)) {
      return true;
    }
  }

  return false;
}

/**
 * Pre-detect obvious mistakes programmatically (doesn't rely on GPT)
 * This catches things GPT might miss
 */
function preDetectMistakes(
  words: TranscriptionWord[],
  config: SpeechCorrectionConfig
): SpeechMistake[] {
  const mistakes: SpeechMistake[] = [];

  console.log('[Speech Correction] Running programmatic pre-detection...');

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const normalized = normalizeWord(word.word);

    // Skip empty words
    if (!normalized) continue;

    // 1. Detect filler words
    if (config.removeFillerWords && isFillerWord(word.word)) {
      // Check context - don't remove "like" in "I like pizza" or "like this"
      const prevWord = i > 0 ? normalizeWord(words[i - 1].word) : '';
      const nextWord = i < words.length - 1 ? normalizeWord(words[i + 1].word) : '';

      // "like" needs context check
      if (normalized === 'like') {
        // Keep "like" if it's used as a verb or comparison
        const verbContexts = ['i', 'you', 'we', 'they', 'would', 'dont', 'didnt', 'do'];
        const comparisonContexts = ['looks', 'look', 'sounds', 'sound', 'feels', 'feel', 'seems', 'seem'];

        if (verbContexts.includes(prevWord) || comparisonContexts.includes(prevWord)) {
          continue; // Skip - this is "I like X" or "looks like X"
        }
        if (nextWord === 'this' || nextWord === 'that' || nextWord === 'a' || nextWord === 'the') {
          continue; // Skip - this might be comparison "like this"
        }
      }

      // "so" and "well" only at sentence starts or after pauses
      if ((normalized === 'so' || normalized === 'well') && i > 0) {
        // Check if there's a significant time gap (indicating sentence start)
        const gap = word.start - words[i - 1].end;
        if (gap < 0.5) {
          continue; // Skip - probably not a filler
        }
      }

      mistakes.push({
        type: 'filler_word',
        startTime: word.start,
        endTime: word.end,
        text: word.word,
        reason: 'Filler word detected',
      });

      console.log(`  [Pre-detect] Filler word: "${word.word}" at ${word.start.toFixed(2)}s`);
    }

    // 2. Detect repeated consecutive words
    if (config.removeRepeatedWords && i > 0) {
      const prevNormalized = normalizeWord(words[i - 1].word);

      if (normalized === prevNormalized && normalized.length > 1) {
        // This is a repeated word - mark the FIRST occurrence for removal
        // (keep the second one as it's usually said more clearly)
        const alreadyMarked = mistakes.some(
          m => m.startTime === words[i - 1].start && m.type === 'repeated_word'
        );

        if (!alreadyMarked) {
          mistakes.push({
            type: 'repeated_word',
            startTime: words[i - 1].start,
            endTime: words[i - 1].end,
            text: `${words[i - 1].word} ${word.word}`,
            reason: 'Repeated word - removing first occurrence',
          });

          console.log(`  [Pre-detect] Repeated word: "${words[i - 1].word}" at ${words[i - 1].start.toFixed(2)}s`);
        }
      }
    }

    // 3. Detect stuttering patterns (partial word repetitions)
    if (i > 0) {
      const prevNormalized = normalizeWord(words[i - 1].word);

      // Check if previous word is a partial/stuttered version of current word
      if (prevNormalized.length >= 1 && prevNormalized.length < normalized.length) {
        if (normalized.startsWith(prevNormalized) ||
            (prevNormalized.length <= 3 && normalized.substring(0, 2) === prevNormalized.substring(0, 2))) {
          mistakes.push({
            type: 'stutter',
            startTime: words[i - 1].start,
            endTime: words[i - 1].end,
            text: words[i - 1].word,
            reason: `Stutter before "${word.word}"`,
          });

          console.log(`  [Pre-detect] Stutter: "${words[i - 1].word}" before "${word.word}" at ${words[i - 1].start.toFixed(2)}s`);
        }
      }
    }
  }

  // 4. Detect multi-word filler phrases
  if (config.removeFillerWords) {
    const fullText = words.map(w => normalizeWord(w.word)).join(' ');

    for (const phrase of FILLER_PHRASES) {
      const normalizedPhrase = phrase.toLowerCase().replace(/[^a-z0-9 ]/g, '');
      let searchStart = 0;

      while (true) {
        const phraseIndex = fullText.indexOf(normalizedPhrase, searchStart);
        if (phraseIndex === -1) break;

        // Find which words this corresponds to
        let charCount = 0;
        let startWordIndex = -1;
        let endWordIndex = -1;

        for (let i = 0; i < words.length; i++) {
          const wordEnd = charCount + normalizeWord(words[i].word).length;

          if (startWordIndex === -1 && wordEnd > phraseIndex) {
            startWordIndex = i;
          }
          if (wordEnd >= phraseIndex + normalizedPhrase.length) {
            endWordIndex = i;
            break;
          }

          charCount = wordEnd + 1; // +1 for space
        }

        if (startWordIndex !== -1 && endWordIndex !== -1) {
          const phraseText = words.slice(startWordIndex, endWordIndex + 1).map(w => w.word).join(' ');

          // Check if already detected
          const alreadyDetected = mistakes.some(
            m => m.startTime === words[startWordIndex].start && m.endTime === words[endWordIndex].end
          );

          if (!alreadyDetected) {
            mistakes.push({
              type: 'filler_word',
              startTime: words[startWordIndex].start,
              endTime: words[endWordIndex].end,
              text: phraseText,
              reason: `Filler phrase: "${phrase}"`,
            });

            console.log(`  [Pre-detect] Filler phrase: "${phraseText}" at ${words[startWordIndex].start.toFixed(2)}s`);
          }
        }

        searchStart = phraseIndex + 1;
      }
    }
  }

  console.log(`[Speech Correction] Pre-detection found ${mistakes.length} mistakes`);
  return mistakes;
}

/**
 * Analyze transcription using GPT to detect speech mistakes
 * This is used IN ADDITION to programmatic detection
 */
export async function detectSpeechMistakesWithGPT(
  words: TranscriptionWord[],
  config: SpeechCorrectionConfig = DEFAULT_SPEECH_CORRECTION_CONFIG
): Promise<SpeechMistake[]> {
  if (!words || words.length === 0) {
    console.log('[Speech Correction] No words provided for analysis');
    return [];
  }

  const openai = getOpenAIClient();

  // Format words with timestamps for analysis
  const wordList = words.map((w, i) => ({
    index: i,
    word: w.word,
    start: w.start,
    end: w.end,
  }));

  // Create transcript text for context
  const transcriptText = words.map(w => w.word).join(' ');

  console.log(`[Speech Correction] Analyzing ${words.length} words with GPT...`);

  const aggressivenessInstructions = {
    conservative: 'Be conservative - only flag clear, obvious mistakes that definitely disrupt the flow.',
    moderate: 'Be moderately aggressive - flag mistakes that a professional editor would remove.',
    aggressive: 'Be very aggressive - flag everything that could possibly be a mistake. When in doubt, flag it.',
  };

  const systemPrompt = `You are an expert video editor analyzing a transcript to find speech mistakes to cut. Your job is to be THOROUGH and find ALL mistakes.

MISTAKES TO FIND:
${config.removeRepeatedWords ? `
1. REPEATED_WORD: Any word said twice in a row or very close together
   - "the the", "I I", "and and", "to to", "a a"
   - "we we need", "it it was", "that that"
   - Even small words count!` : ''}
${config.removeFillerWords ? `
2. FILLER_WORD: Verbal fillers and hesitations
   - "um", "uh", "uhm", "er", "ah", "oh", "hmm", "mm"
   - "like" when used as a filler (NOT as a verb or comparison)
   - "you know" as a filler phrase
   - "I mean" when not actually clarifying
   - "basically", "literally", "actually", "obviously" when overused
   - "so" or "well" at the start of sentences as a filler
   - "right" or "okay" used as verbal tics` : ''}
${config.removeFalseStarts ? `
3. FALSE_START: Incomplete thoughts that get restarted
   - "I was going to-- I decided to..."
   - "We should-- actually let's..."
   - Any sentence that gets abandoned and restarted` : ''}
${config.removeSelfCorrections ? `
4. SELF_CORRECTION: When someone says something wrong then corrects it
   - "I went to the store-- I mean the mall" → cut "I went to the store-- I mean"
   - "It costs fifty-- sorry, sixty dollars" → cut "fifty-- sorry,"
   - Always keep the CORRECT version, cut the wrong part` : ''}
5. STUTTER: Stuttering or partial words
   - "b-b-but", "wh-what", "I-I-I"
   - Any partial word repetition

${aggressivenessInstructions[config.aggressiveness]}

CRITICAL RULES:
1. Be THOROUGH - find every single mistake
2. For repeated words, mark the FIRST occurrence for removal (keep the clearer second one)
3. For self-corrections, mark the WRONG part (keep the correction)
4. Each word has an index - use exact indices
5. Do NOT flag "like" when used as "I like X" or "looks like X"
6. Do NOT flag intentional emphasis or rhetorical repetition

OUTPUT FORMAT - Return JSON:
{
  "mistakes": [
    {
      "type": "FILLER_WORD",
      "startIndex": 5,
      "endIndex": 5,
      "text": "um",
      "reason": "Filler word"
    },
    {
      "type": "REPEATED_WORD",
      "startIndex": 10,
      "endIndex": 10,
      "text": "the",
      "reason": "First of repeated 'the the'"
    }
  ]
}`;

  const userPrompt = `Find ALL speech mistakes in this transcript. Be thorough!

TRANSCRIPT:
"${transcriptText}"

WORD LIST (with indices and timestamps):
${JSON.stringify(wordList, null, 2)}

Return a JSON object with all mistakes found. Check every single word!`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1, // Very low temperature for consistency
    });

    const content = response.choices[0].message.content || '{"mistakes": []}';
    console.log(`[Speech Correction] GPT response: ${content.substring(0, 1000)}...`);

    const parsed = JSON.parse(content);
    const rawMistakes = parsed.mistakes || [];

    // Convert to SpeechMistake format with proper timestamps
    const mistakes: SpeechMistake[] = rawMistakes
      .filter((m: { startIndex?: number; endIndex?: number }) =>
        m.startIndex !== undefined &&
        m.endIndex !== undefined &&
        m.startIndex >= 0 &&
        m.endIndex < words.length &&
        m.startIndex <= m.endIndex
      )
      .map((m: { type: string; startIndex: number; endIndex: number; text: string; reason: string }) => ({
        type: m.type.toLowerCase().replace(/_/g, '_') as MistakeType,
        startTime: words[m.startIndex].start,
        endTime: words[m.endIndex].end,
        text: m.text || words.slice(m.startIndex, m.endIndex + 1).map(w => w.word).join(' '),
        reason: m.reason || 'Detected by AI',
      }));

    console.log(`[Speech Correction] GPT detected ${mistakes.length} additional mistakes`);
    return mistakes;
  } catch (error) {
    console.error('[Speech Correction] Error in GPT detection:', error);
    return [];
  }
}

/**
 * Combined detection: programmatic + GPT
 */
export async function detectSpeechMistakes(
  words: TranscriptionWord[],
  config: SpeechCorrectionConfig = DEFAULT_SPEECH_CORRECTION_CONFIG
): Promise<SpeechMistake[]> {
  if (!words || words.length === 0) {
    return [];
  }

  console.log(`[Speech Correction] Starting combined detection for ${words.length} words...`);
  console.log(`[Speech Correction] Transcript: "${words.map(w => w.word).join(' ')}"`);

  // Step 1: Programmatic pre-detection (fast, reliable for obvious patterns)
  const programmaticMistakes = preDetectMistakes(words, config);

  // Step 2: GPT-based detection (catches context-dependent mistakes)
  const gptMistakes = await detectSpeechMistakesWithGPT(words, config);

  // Step 3: Merge and deduplicate
  const allMistakes = [...programmaticMistakes];

  for (const gptMistake of gptMistakes) {
    // Check if this overlaps with an existing mistake
    const overlaps = allMistakes.some(existing =>
      (gptMistake.startTime >= existing.startTime && gptMistake.startTime <= existing.endTime) ||
      (gptMistake.endTime >= existing.startTime && gptMistake.endTime <= existing.endTime) ||
      (gptMistake.startTime <= existing.startTime && gptMistake.endTime >= existing.endTime)
    );

    if (!overlaps) {
      allMistakes.push(gptMistake);
    }
  }

  // Sort by start time
  allMistakes.sort((a, b) => a.startTime - b.startTime);

  console.log(`[Speech Correction] Total combined mistakes: ${allMistakes.length}`);
  allMistakes.forEach((m, i) => {
    console.log(`  ${i + 1}. [${m.type}] "${m.text}" (${m.startTime.toFixed(2)}s - ${m.endTime.toFixed(2)}s): ${m.reason}`);
  });

  return allMistakes;
}

/**
 * Calculate segments to keep after removing mistakes
 * Returns non-overlapping segments sorted by start time
 */
export function calculateSegmentsToKeep(
  mistakes: SpeechMistake[],
  totalDuration: number,
  padding: number = 0.02 // Smaller padding for tighter cuts
): Array<{ start: number; end: number }> {
  if (mistakes.length === 0) {
    return [{ start: 0, end: totalDuration }];
  }

  // Sort mistakes by start time
  const sortedMistakes = [...mistakes].sort((a, b) => a.startTime - b.startTime);

  // Merge overlapping or adjacent mistakes
  const mergedCuts: Array<{ start: number; end: number }> = [];

  for (const mistake of sortedMistakes) {
    // Use small padding to ensure clean cuts
    const cutStart = Math.max(0, mistake.startTime - padding);
    const cutEnd = Math.min(totalDuration, mistake.endTime + padding);

    if (mergedCuts.length === 0) {
      mergedCuts.push({ start: cutStart, end: cutEnd });
    } else {
      const lastCut = mergedCuts[mergedCuts.length - 1];
      // If this cut overlaps or is very close to the last one, merge them
      if (cutStart <= lastCut.end + 0.05) {
        lastCut.end = Math.max(lastCut.end, cutEnd);
      } else {
        mergedCuts.push({ start: cutStart, end: cutEnd });
      }
    }
  }

  console.log(`[Speech Correction] Merged ${mistakes.length} mistakes into ${mergedCuts.length} cuts`);

  // Calculate segments to keep (inverse of cuts)
  const segmentsToKeep: Array<{ start: number; end: number }> = [];
  let lastEnd = 0;

  for (const cut of mergedCuts) {
    if (cut.start > lastEnd) {
      segmentsToKeep.push({ start: lastEnd, end: cut.start });
    }
    lastEnd = cut.end;
  }

  // Add final segment if there's content after the last cut
  if (lastEnd < totalDuration) {
    segmentsToKeep.push({ start: lastEnd, end: totalDuration });
  }

  // Filter out very short segments (less than 50ms)
  const filteredSegments = segmentsToKeep.filter(seg => (seg.end - seg.start) >= 0.05);

  console.log(`[Speech Correction] Keeping ${filteredSegments.length} segments:`);
  filteredSegments.forEach((seg, i) => {
    console.log(`  Segment ${i + 1}: ${seg.start.toFixed(2)}s - ${seg.end.toFixed(2)}s (${(seg.end - seg.start).toFixed(2)}s)`);
  });

  const totalKept = filteredSegments.reduce((sum, seg) => sum + (seg.end - seg.start), 0);
  const totalCut = totalDuration - totalKept;
  console.log(`[Speech Correction] Total duration: ${totalDuration.toFixed(2)}s, Keeping: ${totalKept.toFixed(2)}s, Cutting: ${totalCut.toFixed(2)}s`);

  return filteredSegments;
}

/**
 * Apply speech corrections by cutting out mistakes from the video
 */
export async function applySpeechCorrections(
  inputPath: string,
  outputPath: string,
  mistakes: SpeechMistake[],
  totalDuration?: number
): Promise<{ outputPath: string; segmentsRemoved: number; timeRemoved: number }> {
  // Get video duration if not provided
  const duration = totalDuration || await new Promise<number>((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration || 0);
    });
  });

  console.log(`[Speech Correction] Applying corrections to video (duration: ${duration.toFixed(2)}s)`);

  // Calculate segments to keep
  const segments = calculateSegmentsToKeep(mistakes, duration);

  if (segments.length === 0) {
    throw new Error('No segments to keep after corrections - this would result in an empty video');
  }

  // If no corrections needed, just copy the file
  if (segments.length === 1 && segments[0].start === 0 && Math.abs(segments[0].end - duration) < 0.1) {
    console.log('[Speech Correction] No corrections needed, copying file');
    fs.copyFileSync(inputPath, outputPath);
    return { outputPath, segmentsRemoved: 0, timeRemoved: 0 };
  }

  // Create filter complex for concatenating segments (same approach as silence removal)
  const filterParts: string[] = [];
  const concatInputs: string[] = [];

  segments.forEach((segment, index) => {
    filterParts.push(
      `[0:v]trim=start=${segment.start}:end=${segment.end},setpts=PTS-STARTPTS[v${index}]`
    );
    filterParts.push(
      `[0:a]atrim=start=${segment.start}:end=${segment.end},asetpts=PTS-STARTPTS[a${index}]`
    );
    concatInputs.push(`[v${index}][a${index}]`);
  });

  const filterComplex = [
    ...filterParts,
    `${concatInputs.join('')}concat=n=${segments.length}:v=1:a=1[outv][outa]`,
  ].join(';');

  console.log(`[Speech Correction] Processing ${segments.length} segments...`);

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .complexFilter(filterComplex)
      .outputOptions([
        '-map', '[outv]',
        '-map', '[outa]',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-threads', '2',
        '-max_muxing_queue_size', '512',
        '-bufsize', '1M',
        '-c:a', 'aac',
        '-b:a', '96k',
      ])
      .output(outputPath)
      .on('end', () => {
        const totalKept = segments.reduce((sum, seg) => sum + (seg.end - seg.start), 0);
        const timeRemoved = duration - totalKept;
        console.log(`[Speech Correction] Complete! Removed ${timeRemoved.toFixed(2)}s of mistakes`);
        resolve({
          outputPath,
          segmentsRemoved: mistakes.length,
          timeRemoved
        });
      })
      .on('error', (err) => {
        console.error(`[Speech Correction] Error:`, err);
        reject(err);
      })
      .run();
  });
}

/**
 * Correlate audio-detected fillers with transcript words
 * This finds transcript words that overlap with audio-detected filler sounds
 */
function correlateAudioFillersWithTranscript(
  audioFillers: Array<{ start: number; end: number; duration: number }>,
  words: TranscriptionWord[]
): SpeechMistake[] {
  const mistakes: SpeechMistake[] = [];

  for (const filler of audioFillers) {
    // Find words that overlap with this audio filler
    const overlappingWords = words.filter(w =>
      (w.start >= filler.start - 0.1 && w.start <= filler.end + 0.1) ||
      (w.end >= filler.start - 0.1 && w.end <= filler.end + 0.1) ||
      (w.start <= filler.start && w.end >= filler.end)
    );

    if (overlappingWords.length > 0) {
      // Check if any overlapping word looks like a filler
      const fillerWord = overlappingWords.find(w => isFillerWord(w.word));

      if (fillerWord) {
        mistakes.push({
          type: 'filler_word',
          startTime: fillerWord.start,
          endTime: fillerWord.end,
          text: fillerWord.word,
          reason: 'Audio-confirmed filler word',
        });
        console.log(`  [Audio+Transcript] Confirmed filler: "${fillerWord.word}" at ${fillerWord.start.toFixed(2)}s`);
      } else {
        // No filler word in transcript, but audio detected something
        // This might be a filler that Whisper cleaned up
        // Use the audio timestamps directly
        const text = overlappingWords.map(w => w.word).join(' ');

        // Only add if it's short enough to be a filler (not a real phrase)
        if (overlappingWords.length <= 2 && filler.duration < 0.8) {
          mistakes.push({
            type: 'filler_word',
            startTime: filler.start,
            endTime: filler.end,
            text: text || '[hesitation]',
            reason: 'Audio-detected hesitation sound',
          });
          console.log(`  [Audio] Detected hesitation at ${filler.start.toFixed(2)}s (transcript: "${text}")`);
        }
      }
    } else {
      // No overlapping words - this is a gap in transcription
      // Could be a filler that Whisper completely skipped
      if (filler.duration >= 0.15 && filler.duration <= 0.6) {
        mistakes.push({
          type: 'filler_word',
          startTime: filler.start,
          endTime: filler.end,
          text: '[filler sound]',
          reason: 'Audio-detected filler (not in transcript)',
        });
        console.log(`  [Audio Only] Detected filler at ${filler.start.toFixed(2)}s (${filler.duration.toFixed(2)}s)`);
      }
    }
  }

  return mistakes;
}

/**
 * Full speech correction pipeline: analyze and apply corrections
 */
export async function correctSpeechMistakes(
  inputPath: string,
  outputPath: string,
  words: TranscriptionWord[],
  config: SpeechCorrectionConfig = DEFAULT_SPEECH_CORRECTION_CONFIG
): Promise<{
  outputPath: string;
  mistakes: SpeechMistake[];
  segmentsRemoved: number;
  timeRemoved: number;
}> {
  console.log('[Speech Correction] Starting full speech correction pipeline...');
  console.log(`[Speech Correction] Config: ${JSON.stringify(config)}`);

  // Get output directory for temp files
  const outputDir = path.dirname(outputPath);

  // Step 1: Run audio-level filler detection (independent of transcript)
  let audioFillerMistakes: SpeechMistake[] = [];
  if (config.removeFillerWords) {
    console.log('[Speech Correction] Step 1: Audio-level filler detection...');
    const audioFillers = await detectFillerSoundsFromAudio(inputPath, outputDir);
    audioFillerMistakes = correlateAudioFillersWithTranscript(audioFillers, words);
    console.log(`[Speech Correction] Audio detection found ${audioFillerMistakes.length} potential fillers`);
  }

  // Step 2: Detect mistakes from transcript (programmatic + GPT)
  console.log('[Speech Correction] Step 2: Transcript-based detection...');
  const transcriptMistakes = await detectSpeechMistakes(words, config);

  // Step 3: Merge audio-detected and transcript-detected mistakes
  console.log('[Speech Correction] Step 3: Merging detections...');
  const allMistakes = [...transcriptMistakes];

  for (const audioMistake of audioFillerMistakes) {
    // Check if this overlaps with an existing detection
    const overlaps = allMistakes.some(existing =>
      Math.abs(audioMistake.startTime - existing.startTime) < 0.2 ||
      (audioMistake.startTime >= existing.startTime - 0.1 && audioMistake.startTime <= existing.endTime + 0.1)
    );

    if (!overlaps) {
      allMistakes.push(audioMistake);
      console.log(`  Added audio-only detection: "${audioMistake.text}" at ${audioMistake.startTime.toFixed(2)}s`);
    }
  }

  // Sort by start time
  allMistakes.sort((a, b) => a.startTime - b.startTime);

  console.log(`[Speech Correction] Total combined mistakes: ${allMistakes.length}`);

  if (allMistakes.length === 0) {
    console.log('[Speech Correction] No mistakes detected, copying file');
    fs.copyFileSync(inputPath, outputPath);
    return { outputPath, mistakes: [], segmentsRemoved: 0, timeRemoved: 0 };
  }

  // Step 4: Apply corrections
  console.log('[Speech Correction] Step 4: Applying corrections...');
  const result = await applySpeechCorrections(inputPath, outputPath, allMistakes);

  return {
    outputPath: result.outputPath,
    mistakes: allMistakes,
    segmentsRemoved: result.segmentsRemoved,
    timeRemoved: result.timeRemoved,
  };
}

/**
 * Generate a correction report for user review
 */
export function generateCorrectionReport(mistakes: SpeechMistake[]): string {
  if (mistakes.length === 0) {
    return 'No speech mistakes detected.';
  }

  const grouped: Record<string, SpeechMistake[]> = {};
  for (const mistake of mistakes) {
    if (!grouped[mistake.type]) {
      grouped[mistake.type] = [];
    }
    grouped[mistake.type].push(mistake);
  }

  let report = `Speech Correction Report\n${'='.repeat(50)}\n\n`;
  report += `Total mistakes found: ${mistakes.length}\n\n`;

  for (const [type, items] of Object.entries(grouped)) {
    const typeName = type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    report += `${typeName} (${items.length}):\n`;
    for (const item of items) {
      report += `  - "${item.text}" at ${item.startTime.toFixed(2)}s\n`;
    }
    report += '\n';
  }

  const totalTime = mistakes.reduce((sum, m) => sum + (m.endTime - m.startTime), 0);
  report += `Estimated time to be removed: ${totalTime.toFixed(2)} seconds\n`;

  return report;
}
