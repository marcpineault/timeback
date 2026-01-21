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

export interface TranscriptionResult {
  text: string;
  segments: TranscriptionSegment[];
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
  audioPath: string
): Promise<{ text: string; segments: TranscriptionSegment[] }> {
  const openai = getOpenAIClient();
  const audioFile = fs.createReadStream(audioPath);

  const response = await openai.audio.transcriptions.create({
    file: audioFile,
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: ['segment'],
  });

  const segments: TranscriptionSegment[] = (response.segments || []).map((seg) => ({
    start: seg.start,
    end: seg.end,
    text: seg.text.trim(),
  }));

  return {
    text: response.text,
    segments,
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
 * Generate SRT file from transcription segments
 */
export function generateSrt(
  segments: TranscriptionSegment[],
  outputPath: string
): string {
  const srtContent = segments
    .map((segment, index) => {
      return `${index + 1}\n${formatSrtTime(segment.start)} --> ${formatSrtTime(
        segment.end
      )}\n${segment.text}\n`;
    })
    .join('\n');

  fs.writeFileSync(outputPath, srtContent, 'utf-8');
  return outputPath;
}

/**
 * Analyze transcript and identify key moments for B-roll
 */
export async function identifyBRollMoments(
  segments: TranscriptionSegment[],
  maxMoments: number = 3
): Promise<BRollMoment[]> {
  const openai = getOpenAIClient();

  // Combine segments into text with timestamps
  const transcriptWithTimestamps = segments
    .map(s => `[${s.start.toFixed(1)}s] ${s.text}`)
    .join('\n');

  console.log(`[B-Roll] Analyzing transcript with ${segments.length} segments`);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a video editor assistant. Analyze the transcript and identify exactly ${maxMoments} key moments where a visual B-roll cutaway would enhance the content.

For each moment, provide:
1. timestamp: The time in seconds where the cutaway should start
2. duration: How long the cutaway should last (2-4 seconds)
3. prompt: A detailed DALL-E image prompt that would create an engaging visual
4. context: Brief description of what's being discussed

Focus on moments that mention specific concepts, objects, or scenarios that can be visualized.

You MUST return a JSON object with a "moments" array containing exactly ${maxMoments} objects.
Example: {"moments": [{"timestamp": 5.2, "duration": 3, "prompt": "A luxurious modern office with floor-to-ceiling windows overlooking a city skyline", "context": "discussing business growth"}]}`
      },
      {
        role: 'user',
        content: `Analyze this transcript and find ${maxMoments} key visual moments:\n\n${transcriptWithTimestamps}`
      }
    ],
    response_format: { type: 'json_object' }
  });

  try {
    const content = response.choices[0].message.content || '{"moments": []}';
    console.log(`[B-Roll] GPT response: ${content.substring(0, 200)}...`);
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

/**
 * Full transcription pipeline: extract audio, transcribe, generate SRT
 */
export async function transcribeVideo(
  videoPath: string,
  outputDir: string
): Promise<TranscriptionResult> {
  const baseName = path.basename(videoPath, path.extname(videoPath));
  const audioPath = path.join(outputDir, `${baseName}_audio.mp3`);
  const srtPath = path.join(outputDir, `${baseName}.srt`);

  // Extract audio
  await extractAudio(videoPath, audioPath);

  // Transcribe
  const { text, segments } = await transcribeAudio(audioPath);

  // Generate SRT
  generateSrt(segments, srtPath);

  // Clean up audio file
  fs.unlinkSync(audioPath);

  return {
    text,
    segments,
    srtPath,
  };
}
