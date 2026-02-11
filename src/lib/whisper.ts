import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }
  return new OpenAI({ apiKey });
}

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionWord {
  word: string;
  start: number;
  end: number;
}

export interface TranscriptionResult {
  text: string;
  segments: TranscriptionSegment[];
  words?: TranscriptionWord[];
  srtPath: string;
}

export interface BRollMoment {
  timestamp: number;
  duration: number;
  prompt: string;
  context: string;
}

/**
 * Extract audio from video for transcription
 */
export async function extractAudio(
  videoPath: string,
  outputPath: string
): Promise<string> {
  const ffmpeg = (await import('fluent-ffmpeg')).default;

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run();
  });
}

/**
 * Transcribe audio using OpenAI Whisper API
 */
export async function transcribeAudio(
  audioPath: string,
  options: {
    includeWords?: boolean;
    includeFillerWords?: boolean;
  } = {}
): Promise<{ text: string; segments: TranscriptionSegment[]; words?: TranscriptionWord[] }> {
  const openai = getOpenAIClient();
  const audioFile = fs.createReadStream(audioPath);

  // Request word-level timestamps if needed for animated captions
  const granularities: ('segment' | 'word')[] = options.includeWords
    ? ['segment', 'word']
    : ['segment'];

  // When we want to detect filler words for speech correction,
  // we need to prompt Whisper to include them (it normally cleans them up)
  // This prompt tells Whisper to transcribe verbatim including hesitations
  const fillerWordsPrompt = options.includeFillerWords
    ? 'Um, uh, er, ah, like, you know, I mean, basically, actually, so, well, right, okay. Include all filler words, hesitations, stutters, and verbal tics exactly as spoken. Transcribe verbatim without cleaning up speech.'
    : undefined;

  console.log(`[Transcription] Transcribing with options:`, {
    includeWords: options.includeWords,
    includeFillerWords: options.includeFillerWords,
    hasPrompt: !!fillerWordsPrompt,
  });

  const response = await openai.audio.transcriptions.create({
    file: audioFile,
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: granularities,
    ...(fillerWordsPrompt && { prompt: fillerWordsPrompt }),
  });

  const segments: TranscriptionSegment[] = (response.segments || []).map((seg) => ({
    start: seg.start,
    end: seg.end,
    text: seg.text.trim(),
  }));

  // Extract word-level timestamps if requested
  const words: TranscriptionWord[] | undefined = options.includeWords
    ? ((response as { words?: Array<{ word: string; start: number; end: number }> }).words || []).map((w) => ({
        word: w.word,
        start: w.start,
        end: w.end,
      }))
    : undefined;

  console.log(`[Transcription] Result: ${segments.length} segments, ${words?.length || 0} words`);
  if (words && words.length > 0) {
    console.log(`[Transcription] First 20 words: ${words.slice(0, 20).map(w => w.word).join(' ')}`);
  }

  return {
    text: response.text,
    segments,
    words,
  };
}

/**
 * Format seconds to SRT timestamp format (HH:MM:SS,mmm)
 */
function formatSrtTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);

  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms
    .toString()
    .padStart(3, '0')}`;
}

/**
 * Format seconds to ASS timestamp format (H:MM:SS.cc)
 */
function formatAssTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const centiseconds = Math.round((seconds % 1) * 100);

  return `${hours}:${minutes.toString().padStart(2, '0')}:${secs
    .toString()
    .padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
}

/**
 * Split text into short chunks for short-form video captions
 * Max ~6 words per caption (fits nicely on 2 lines of ~3 words each)
 */
function splitIntoShortCaptions(
  text: string,
  start: number,
  end: number,
  maxWords: number = 6
): TranscriptionSegment[] {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) {
    return [{ text, start, end }];
  }

  const chunks: TranscriptionSegment[] = [];
  const totalDuration = end - start;
  const wordDuration = totalDuration / words.length;

  for (let i = 0; i < words.length; i += maxWords) {
    const chunkWords = words.slice(i, i + maxWords);
    const chunkStart = start + (i * wordDuration);
    const chunkEnd = Math.min(end, start + ((i + chunkWords.length) * wordDuration));

    chunks.push({
      text: chunkWords.join(' '),
      start: chunkStart,
      end: chunkEnd,
    });
  }

  return chunks;
}

/**
 * Generate SRT file from transcription segments
 * Splits long segments into shorter captions (max 2 lines)
 */
export function generateSrt(
  segments: TranscriptionSegment[],
  outputPath: string
): string {
  // Split long segments into shorter captions
  const shortSegments: TranscriptionSegment[] = [];
  for (const segment of segments) {
    const split = splitIntoShortCaptions(segment.text, segment.start, segment.end);
    shortSegments.push(...split);
  }

  // Breathing room: extend caption end times so they don't vanish the instant the last word ends
  const captionEndPadding = 0.4; // 400ms extra after the last word
  const srtContent = shortSegments
    .map((segment, index) => {
      const nextStart = index < shortSegments.length - 1 ? shortSegments[index + 1].start : Infinity;
      const paddedEnd = Math.min(segment.end + captionEndPadding, nextStart);
      return `${index + 1}\n${formatSrtTime(segment.start)} --> ${formatSrtTime(
        paddedEnd
      )}\n${segment.text}\n`;
    })
    .join('\n');

  fs.writeFileSync(outputPath, srtContent, 'utf-8');
  return outputPath;
}

/**
 * Group words into lines for display
 * Short-form style: max 3-4 words per line for easy reading
 */
function groupWordsIntoLines(
  words: TranscriptionWord[],
  maxWordsPerLine: number = 3
): Array<{ words: TranscriptionWord[]; start: number; end: number }> {
  const lines: Array<{ words: TranscriptionWord[]; start: number; end: number }> = [];
  let currentLine: TranscriptionWord[] = [];
  let lineStart = 0;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];

    if (currentLine.length === 0) {
      lineStart = word.start;
    }

    currentLine.push(word);

    // Check if we should break the line
    const shouldBreak =
      currentLine.length >= maxWordsPerLine ||
      // Break on natural pauses (gaps > 0.5s between words)
      (i < words.length - 1 && words[i + 1].start - word.end > 0.5) ||
      // Break on sentence-ending punctuation
      /[.!?]$/.test(word.word);

    if (shouldBreak || i === words.length - 1) {
      lines.push({
        words: currentLine,
        start: lineStart,
        end: word.end,
      });
      currentLine = [];
    }
  }

  return lines;
}

/**
 * Generate ASS subtitle file with word-by-word animation (karaoke style)
 */
export function generateAnimatedAss(
  words: TranscriptionWord[],
  outputPath: string
): string {
  // ASS header with styles
  // Default style: words start gray, then highlight to yellow when spoken
  const header = `[Script Info]
Title: Animated Captions
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H0000FFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,2,2,100,100,100,1
Style: Highlight,Arial,48,&H0000FFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,2,2,100,100,100,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // Group words into displayable lines
  const lines = groupWordsIntoLines(words);

  // Generate dialogue events for each line
  const events: string[] = [];

  // Breathing room: extend caption end times so they don't vanish the instant the last word ends
  const captionEndPadding = 0.4; // 400ms extra after the last word

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const nextLineStart = lineIdx < lines.length - 1 ? lines[lineIdx + 1].start : Infinity;
    // Extend end time by padding, but don't overlap the next caption
    const paddedEnd = Math.min(line.end + captionEndPadding, nextLineStart);

    const startTime = formatAssTime(line.start);
    const endTime = formatAssTime(paddedEnd);

    // Build the text with karaoke timing tags
    // Each word gets a \kf tag with duration in centiseconds
    let text = '';
    for (let i = 0; i < line.words.length; i++) {
      const word = line.words[i];
      const wordDuration = Math.round((word.end - word.start) * 100); // Convert to centiseconds

      // Add karaoke fill tag (\kf) - fills the word progressively
      // Color override: start with white, fill with yellow
      text += `{\\kf${wordDuration}}${word.word} `;
    }

    text = text.trim();

    // Create dialogue event
    events.push(`Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,${text}`);
  }

  const assContent = header + events.join('\n') + '\n';
  fs.writeFileSync(outputPath, assContent, 'utf-8');

  return outputPath;
}

/**
 * Animation context keywords that help select appropriate animations
 */
const ANIMATION_CONTEXT_HINTS = `
Animation keywords to include in context (use these exact terms when applicable):
- For upward trends: "growth", "increase", "rise", "profit", "success", "gains", "boost"
- For downward trends: "crash", "fall", "decline", "loss", "drop", "decrease"
- For money/numbers: "money", "dollar", "revenue", "income", "million", "thousand", "price", "cost"
- For percentages: "percent", "percentage", "rate", "conversion"
- For comparisons: "compare", "versus", "vs", "better than", "difference", "before and after"
- For progress: "progress", "completion", "goal", "target", "achieving"
- For success: "success", "correct", "approved", "verified", "achieved", "completed"
- For time: "time", "hours", "minutes", "duration", "deadline", "schedule"
- For data: "data", "statistics", "analytics", "metrics", "results", "research"
- For emphasis: "important", "key", "crucial", "highlight", "attention", "critical"
`.trim();

/**
 * Analyze transcript and identify key moments for B-roll animations
 */
export async function identifyBRollMoments(
  segments: TranscriptionSegment[],
  maxMoments: number = 3,
  style: 'minimal' | 'dynamic' | 'data-focused' = 'dynamic'
): Promise<BRollMoment[]> {
  const openai = getOpenAIClient();

  // Combine segments into text with timestamps
  const transcriptWithTimestamps = segments
    .map(s => `[${s.start.toFixed(1)}s] ${s.text}`)
    .join('\n');

  console.log(`[B-Roll] Analyzing transcript with ${segments.length} segments (style: ${style})`);

  // Adjust prompt based on style
  const styleGuidance = style === 'minimal'
    ? 'Focus on the most impactful moments only. Prefer simple, clean visual concepts.'
    : style === 'data-focused'
    ? 'Prioritize moments mentioning numbers, statistics, comparisons, or data-driven concepts.'
    : 'Balance between data visualizations and engaging visual highlights throughout the video.';

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a video editor specializing in short-form content. Identify exactly ${maxMoments} key moments for animated B-roll overlays.

${styleGuidance}

For each moment, provide:
1. timestamp: Time in seconds where the animation should start (avoid the first 1 second)
2. duration: How long the animation should display (2-4 seconds, shorter for high-energy content)
3. context: A keyword-rich description that will help select the right animation type

${ANIMATION_CONTEXT_HINTS}

Guidelines:
- Space moments throughout the video for visual variety
- Don't overlap with natural visual hooks (first few seconds)
- Choose moments where the speaker makes a key point or presents information
- The context field should contain relevant keywords from the list above

You MUST return a JSON object with a "moments" array containing exactly ${maxMoments} objects.
Example: {"moments": [
  {"timestamp": 3.5, "duration": 3, "context": "discussing revenue growth and profit increase"},
  {"timestamp": 12.0, "duration": 2.5, "context": "comparing results before and after, showing improvement"},
  {"timestamp": 22.5, "duration": 3, "context": "key statistics showing 75 percent success rate"}
]}`
      },
      {
        role: 'user',
        content: `Analyze this transcript and find ${maxMoments} key moments for animated overlays:\n\n${transcriptWithTimestamps}`
      }
    ],
    response_format: { type: 'json_object' }
  });

  try {
    const content = response.choices[0].message.content || '{"moments": []}';
    console.log(`[B-Roll] GPT response: ${content.substring(0, 300)}...`);
    const parsed = JSON.parse(content);
    const moments = parsed.moments || [];
    console.log(`[B-Roll] Parsed ${moments.length} moments`);
    return Array.isArray(moments) ? moments.slice(0, maxMoments) : [];
  } catch (err) {
    console.error('[B-Roll] Failed to parse moments:', err);
    return [];
  }
}

/**
 * Generate B-roll image using DALL-E
 */
export async function generateBRollImage(
  prompt: string,
  outputPath: string
): Promise<string> {
  const openai = getOpenAIClient();

  console.log(`[B-Roll] Generating image: "${prompt.substring(0, 50)}..."`);

  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt: `Cinematic, high-quality visual for a short-form video: ${prompt}. Style: modern, clean, visually striking, suitable for social media content.`,
    n: 1,
    size: '1024x1792', // Vertical for reels
    quality: 'standard',
  });

  const imageUrl = response.data?.[0]?.url;
  if (!imageUrl) throw new Error('No image URL returned');

  // Download the image
  const imageResponse = await fetch(imageUrl);
  const buffer = Buffer.from(await imageResponse.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);

  console.log(`[B-Roll] Image saved to: ${outputPath}`);
  return outputPath;
}

/**
 * Extract the hook (first sentence) from transcription text
 * Simple extraction - use generateAIHeadline for smarter hook detection
 */
export function extractHook(text: string, maxLength: number = 60): string {
  // Try to find the first sentence
  const sentenceMatch = text.match(/^[^.!?]+[.!?]/);
  let hook = sentenceMatch ? sentenceMatch[0].trim() : text.split(' ').slice(0, 10).join(' ');

  // Truncate if too long
  if (hook.length > maxLength) {
    hook = hook.substring(0, maxLength - 3).trim() + '...';
  }

  return hook;
}

export interface AIHeadlineResult {
  headline: string;
  hook: string;
  confidence: number;
}

/**
 * Generate an engaging headline using AI analysis of the transcript
 * Also identifies the most attention-grabbing hook from the content
 */
export async function generateAIHeadline(
  segments: TranscriptionSegment[],
  options: {
    style?: 'bold' | 'question' | 'statement' | 'curiosity';
    maxLength?: number;
  } = {}
): Promise<AIHeadlineResult> {
  const openai = getOpenAIClient();
  const { style = 'curiosity', maxLength = 50 } = options;

  // Combine segments into full transcript
  const fullTranscript = segments.map(s => s.text).join(' ');

  console.log(`[Headline] Generating AI headline for ${segments.length} segments`);

  const styleInstructions: Record<string, string> = {
    bold: 'Create a bold, impactful statement that makes a strong claim',
    question: 'Create an intriguing question that makes viewers want to know the answer',
    statement: 'Create a clear, direct statement that summarizes the key value',
    curiosity: 'Create a curiosity-driven hook that teases the content without revealing everything',
  };

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are an expert social media content strategist specializing in short-form video. Your task is to create scroll-stopping headlines for video content.

Guidelines:
- ${styleInstructions[style]}
- Keep headlines under ${maxLength} characters
- Use power words that trigger emotion or curiosity
- Avoid clickbait that doesn't deliver
- Make it relevant to the actual content
- Use sentence case (capitalize first word and proper nouns only)

You must return a JSON object with:
1. "headline": The main headline text (max ${maxLength} chars)
2. "hook": The most engaging sentence or phrase from the transcript that would hook viewers (max 60 chars)
3. "confidence": How confident you are this headline will perform well (0.0-1.0)

Example output: {"headline": "This changed how I think about money", "hook": "Nobody told me this until I was 30", "confidence": 0.85}`
      },
      {
        role: 'user',
        content: `Create an engaging headline and identify the best hook from this video transcript:\n\n${fullTranscript}`
      }
    ],
    response_format: { type: 'json_object' }
  });

  try {
    const content = response.choices[0].message.content || '{}';
    console.log(`[Headline] AI response: ${content.substring(0, 150)}...`);
    const parsed = JSON.parse(content);

    // Ensure headline fits within maxLength
    let headline = parsed.headline || extractHook(fullTranscript, maxLength);
    if (headline.length > maxLength) {
      headline = headline.substring(0, maxLength - 3).trim() + '...';
    }

    // Ensure hook fits within 60 chars
    let hook = parsed.hook || extractHook(fullTranscript, 60);
    if (hook.length > 60) {
      hook = hook.substring(0, 57).trim() + '...';
    }

    return {
      headline,
      hook,
      confidence: parsed.confidence || 0.5,
    };
  } catch (err) {
    console.error('[Headline] Failed to parse AI response:', err);
    // Fallback to simple extraction
    const fallbackHook = extractHook(fullTranscript, 60);
    return {
      headline: fallbackHook,
      hook: fallbackHook,
      confidence: 0.3,
    };
  }
}

/**
 * Full transcription pipeline: extract audio, transcribe, generate SRT/ASS
 */
export async function transcribeVideo(
  videoPath: string,
  outputDir: string,
  options: {
    animated?: boolean;
    forSpeechCorrection?: boolean;
  } = {}
): Promise<TranscriptionResult> {
  const baseName = path.basename(videoPath, path.extname(videoPath));
  const audioPath = path.join(outputDir, `${baseName}_audio.mp3`);
  const srtPath = options.animated
    ? path.join(outputDir, `${baseName}.ass`)
    : path.join(outputDir, `${baseName}.srt`);

  // Extract audio
  await extractAudio(videoPath, audioPath);

  // Transcribe
  // - Include word-level timestamps for animated captions or speech correction
  // - Include filler words prompt when doing speech correction
  const needsWords = options.animated || options.forSpeechCorrection;
  const { text, segments, words } = await transcribeAudio(audioPath, {
    includeWords: needsWords,
    includeFillerWords: options.forSpeechCorrection,
  });

  // Generate subtitle file (skip if this is just for speech correction)
  if (options.animated && words && words.length > 0) {
    generateAnimatedAss(words, srtPath);
    console.log(`[Transcription] Generated animated ASS with ${words.length} words`);
  } else if (!options.forSpeechCorrection || options.animated !== undefined) {
    generateSrt(segments, srtPath);
    console.log(`[Transcription] Generated SRT with ${segments.length} segments`);
  }

  // Clean up audio file
  fs.unlinkSync(audioPath);

  return {
    text,
    segments,
    words,
    srtPath,
  };
}
