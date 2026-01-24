import OpenAI from 'openai';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import { TranscriptionWord } from './whisper';

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
 * Common filler words to detect
 */
const FILLER_WORDS = [
  'um', 'uh', 'uhm', 'uhh', 'umm',
  'er', 'err', 'eh',
  'like',  // when used as filler
  'you know',
  'basically',
  'actually',  // when overused
  'so',  // when used as filler at start
  'well',  // when used as filler
  'right',  // when used as filler
  'okay', 'ok',
  'I mean',
  'kind of', 'kinda',
  'sort of', 'sorta',
];

/**
 * Analyze transcription using GPT to detect speech mistakes
 */
export async function detectSpeechMistakes(
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

  console.log(`[Speech Correction] Analyzing ${words.length} words for mistakes...`);
  console.log(`[Speech Correction] Config: ${JSON.stringify(config)}`);

  const systemPrompt = `You are an expert video editor AI assistant. Your task is to analyze a transcript and identify speech mistakes that should be cut from a video to make it sound more professional and polished.

Types of mistakes to identify:
${config.removeRepeatedWords ? '- REPEATED_WORD: Duplicate words like "the the", "I I", "and and"' : ''}
${config.removeFillerWords ? '- FILLER_WORD: Words like "um", "uh", "like" (when used as filler), "you know", "basically", "actually", "so" (at sentence start), "I mean"' : ''}
${config.removeFalseStarts ? '- FALSE_START: Incomplete sentences that get restarted, abandoned phrases' : ''}
${config.removeSelfCorrections ? '- SELF_CORRECTION: When someone says something wrong then corrects themselves, identify the WRONG part to cut (e.g., "I went to the store- I mean the mall" - cut "I went to the store- I mean")' : ''}
- STUTTER: Stuttering patterns like "b-b-but", "wh-what", "the-the-the"
- REPEATED_PHRASE: Phrases repeated multiple times like "so basically, so basically"

Aggressiveness level: ${config.aggressiveness}
- conservative: Only flag obvious, clear mistakes that definitely should be removed
- moderate: Flag most mistakes but preserve natural speech patterns that add character
- aggressive: Remove all identified issues for maximum polish

IMPORTANT RULES:
1. Only identify actual mistakes - do not flag intentional repetition for emphasis
2. For self-corrections, only cut the INCORRECT part, keep the correction
3. Be precise with word indices - each word has a unique index
4. Consider context - "like" as a comparison ("like this") should NOT be cut
5. Group consecutive mistakes together when they form one logical cut
6. Preserve meaning - never cut words that would make the sentence incomprehensible

Return a JSON object with a "mistakes" array. Each mistake should have:
- type: The type of mistake (REPEATED_WORD, FILLER_WORD, FALSE_START, SELF_CORRECTION, STUTTER, REPEATED_PHRASE)
- startIndex: The index of the first word to cut
- endIndex: The index of the last word to cut (inclusive)
- text: The actual text being cut
- reason: Brief explanation of why this should be cut

Example response:
{
  "mistakes": [
    {"type": "FILLER_WORD", "startIndex": 5, "endIndex": 5, "text": "um", "reason": "Filler word"},
    {"type": "REPEATED_WORD", "startIndex": 12, "endIndex": 13, "text": "the the", "reason": "Duplicate word"},
    {"type": "SELF_CORRECTION", "startIndex": 20, "endIndex": 25, "text": "I went to the store- I mean", "reason": "Self-correction, keeping the correct version"}
  ]
}`;

  const userPrompt = `Analyze this transcript for speech mistakes:

TRANSCRIPT:
"${transcriptText}"

WORD LIST WITH INDICES AND TIMESTAMPS:
${JSON.stringify(wordList, null, 2)}

Identify all speech mistakes that should be cut to make this video more professional. Return ONLY a JSON object with the mistakes array.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3, // Lower temperature for more consistent results
    });

    const content = response.choices[0].message.content || '{"mistakes": []}';
    console.log(`[Speech Correction] GPT response: ${content.substring(0, 500)}...`);

    const parsed = JSON.parse(content);
    const rawMistakes = parsed.mistakes || [];

    // Convert to SpeechMistake format with proper timestamps
    const mistakes: SpeechMistake[] = rawMistakes
      .filter((m: { startIndex?: number; endIndex?: number }) =>
        m.startIndex !== undefined &&
        m.endIndex !== undefined &&
        m.startIndex >= 0 &&
        m.endIndex < words.length
      )
      .map((m: { type: string; startIndex: number; endIndex: number; text: string; reason: string }) => ({
        type: m.type.toLowerCase().replace(/_/g, '_') as MistakeType,
        startTime: words[m.startIndex].start,
        endTime: words[m.endIndex].end,
        text: m.text,
        reason: m.reason,
      }));

    console.log(`[Speech Correction] Detected ${mistakes.length} mistakes`);
    mistakes.forEach((m, i) => {
      console.log(`  ${i + 1}. [${m.type}] "${m.text}" (${m.startTime.toFixed(2)}s - ${m.endTime.toFixed(2)}s): ${m.reason}`);
    });

    return mistakes;
  } catch (error) {
    console.error('[Speech Correction] Error detecting mistakes:', error);
    return [];
  }
}

/**
 * Calculate segments to keep after removing mistakes
 * Returns non-overlapping segments sorted by start time
 */
export function calculateSegmentsToKeep(
  mistakes: SpeechMistake[],
  totalDuration: number,
  padding: number = 0.05 // Small padding around cuts for smoother transitions
): Array<{ start: number; end: number }> {
  if (mistakes.length === 0) {
    return [{ start: 0, end: totalDuration }];
  }

  // Sort mistakes by start time
  const sortedMistakes = [...mistakes].sort((a, b) => a.startTime - b.startTime);

  // Merge overlapping or adjacent mistakes
  const mergedCuts: Array<{ start: number; end: number }> = [];

  for (const mistake of sortedMistakes) {
    const cutStart = Math.max(0, mistake.startTime - padding);
    const cutEnd = Math.min(totalDuration, mistake.endTime + padding);

    if (mergedCuts.length === 0) {
      mergedCuts.push({ start: cutStart, end: cutEnd });
    } else {
      const lastCut = mergedCuts[mergedCuts.length - 1];
      // If this cut overlaps or is very close to the last one, merge them
      if (cutStart <= lastCut.end + 0.1) {
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

  // Filter out very short segments (less than 100ms)
  const filteredSegments = segmentsToKeep.filter(seg => (seg.end - seg.start) >= 0.1);

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

  // Step 1: Detect mistakes using AI
  const mistakes = await detectSpeechMistakes(words, config);

  if (mistakes.length === 0) {
    console.log('[Speech Correction] No mistakes detected, copying file');
    fs.copyFileSync(inputPath, outputPath);
    return { outputPath, mistakes: [], segmentsRemoved: 0, timeRemoved: 0 };
  }

  // Step 2: Apply corrections
  const result = await applySpeechCorrections(inputPath, outputPath, mistakes);

  return {
    outputPath: result.outputPath,
    mistakes,
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
