import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { logger } from './logger';
import { SilenceInterval } from './ffmpeg';

/**
 * Speech segment detected by Silero VAD
 */
export interface SpeechSegment {
  start: number;   // seconds
  end: number;     // seconds
  confidence: number;
}

/**
 * Silero VAD configuration parameters
 */
export interface SileroVadConfig {
  /** VAD probability threshold (0-1). Lower = catches more speech. Default: 0.35 */
  threshold: number;
  /** Negative threshold for hysteresis. Must drop below this to mark silence. Default: 0.15 */
  negThreshold: number;
  /** Minimum speech duration in ms. Shorter segments are discarded. Default: 250 */
  minSpeechDurationMs: number;
  /** Minimum silence duration in ms. Gaps shorter than this are bridged. Default: 300 */
  minSilenceDurationMs: number;
  /** Padding added around speech segments in ms. Default: 200 */
  speechPadMs: number;
}

/**
 * Default conservative VAD config — biased toward keeping speech
 */
export const DEFAULT_VAD_CONFIG: SileroVadConfig = {
  threshold: 0.35,
  negThreshold: 0.15,
  minSpeechDurationMs: 250,
  minSilenceDurationMs: 300,
  speechPadMs: 200,
};

/**
 * Extract 16kHz mono WAV from a video file using FFmpeg
 */
export async function extractWavForVad(
  inputPath: string,
  outputPath: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i', inputPath,
      '-ar', '16000',
      '-ac', '1',
      '-f', 'wav',
      '-acodec', 'pcm_s16le',
      outputPath,
    ];

    const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`FFmpeg WAV extraction failed (code ${code}): ${stderr.slice(-500)}`));
      } else {
        resolve(outputPath);
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn FFmpeg for WAV extraction: ${err.message}`));
    });
  });
}

/**
 * Read a 16-bit PCM WAV file and return float32 samples
 */
function readWavSamples(wavPath: string): Float32Array {
  const buffer = fs.readFileSync(wavPath);

  // Find the 'data' chunk in the WAV file
  let dataOffset = 44; // Standard WAV header size
  let dataSize = buffer.length - 44;

  // Search for 'data' marker in case of non-standard headers
  for (let i = 12; i < Math.min(buffer.length - 8, 200); i++) {
    if (
      buffer[i] === 0x64 &&     // 'd'
      buffer[i + 1] === 0x61 && // 'a'
      buffer[i + 2] === 0x74 && // 't'
      buffer[i + 3] === 0x61    // 'a'
    ) {
      dataSize = buffer.readUInt32LE(i + 4);
      dataOffset = i + 8;
      break;
    }
  }

  const numSamples = Math.floor(dataSize / 2); // 16-bit = 2 bytes per sample
  const samples = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const int16 = buffer.readInt16LE(dataOffset + i * 2);
    samples[i] = int16 / 32768.0; // Normalize to [-1, 1]
  }

  return samples;
}

/**
 * Run Silero VAD on audio samples using ONNX Runtime
 *
 * Processes audio in 512-sample chunks (32ms at 16kHz) and returns
 * speech segments with start/end times and confidence scores.
 */
export async function runSileroVad(
  samples: Float32Array,
  sampleRate: number = 16000,
  config: SileroVadConfig = DEFAULT_VAD_CONFIG
): Promise<SpeechSegment[]> {
  // Dynamic import for onnxruntime-web (WASM backend — no native/glibc dependency)
  const ort = await import('onnxruntime-web');

  // Locate the Silero VAD ONNX model
  const modelPath = await getSileroModelPath();
  if (!modelPath) {
    throw new Error('Silero VAD ONNX model not found. Please ensure @ricky0123/vad-node is installed.');
  }

  logger.info(`[Silero VAD] Loading model from ${modelPath}`);
  const modelBuffer = fs.readFileSync(modelPath);
  const session = await ort.InferenceSession.create(modelBuffer, {
    executionProviders: ['wasm'],
  });

  const windowSize = 512; // 32ms at 16kHz — Silero expects this
  const numWindows = Math.floor(samples.length / windowSize);
  const samplesPerSecond = sampleRate;

  // Silero VAD state tensors (hidden states for the recurrent model)
  let h = new ort.Tensor('float32', new Float32Array(2 * 1 * 64), [2, 1, 64]);
  let c = new ort.Tensor('float32', new Float32Array(2 * 1 * 64), [2, 1, 64]);
  const srTensor = new ort.Tensor('int64', BigInt64Array.from([BigInt(sampleRate)]), []);

  const probabilities: number[] = [];

  logger.info(`[Silero VAD] Processing ${numWindows} windows (${(samples.length / samplesPerSecond).toFixed(1)}s audio)`);

  for (let i = 0; i < numWindows; i++) {
    const windowStart = i * windowSize;
    const windowSamples = samples.slice(windowStart, windowStart + windowSize);

    const inputTensor = new ort.Tensor('float32', windowSamples, [1, windowSize]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const feeds: Record<string, any> = {
      input: inputTensor,
      h: h,
      c: c,
      sr: srTensor,
    };

    const results = await session.run(feeds);

    // Extract speech probability from output
    const output = results.output;
    const prob = (output.data as Float32Array)[0];
    probabilities.push(prob);

    // Update hidden states
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    h = results.hn as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c = results.cn as any;
  }

  // Convert probabilities to speech segments using hysteresis thresholding
  const segments = probabilitiesToSegments(
    probabilities,
    windowSize / samplesPerSecond, // seconds per window
    config
  );

  logger.info(`[Silero VAD] Found ${segments.length} speech segments`);

  return segments;
}

/**
 * Convert frame-level probabilities to speech segments using hysteresis thresholding
 *
 * Uses a two-threshold approach:
 * - Speech starts when probability exceeds `threshold`
 * - Speech ends when probability drops below `negThreshold`
 * This prevents rapid toggling at speech boundaries.
 */
function probabilitiesToSegments(
  probabilities: number[],
  secondsPerWindow: number,
  config: SileroVadConfig
): SpeechSegment[] {
  const rawSegments: SpeechSegment[] = [];
  let inSpeech = false;
  let speechStart = 0;
  let speechProbs: number[] = [];

  for (let i = 0; i < probabilities.length; i++) {
    const prob = probabilities[i];
    const time = i * secondsPerWindow;

    if (!inSpeech && prob >= config.threshold) {
      // Speech onset detected
      inSpeech = true;
      speechStart = time;
      speechProbs = [prob];
    } else if (inSpeech && prob < config.negThreshold) {
      // Speech offset detected (hysteresis — must drop below negThreshold)
      const speechEnd = time;
      const durationMs = (speechEnd - speechStart) * 1000;

      if (durationMs >= config.minSpeechDurationMs) {
        const avgConfidence = speechProbs.reduce((a, b) => a + b, 0) / speechProbs.length;
        rawSegments.push({
          start: speechStart,
          end: speechEnd,
          confidence: avgConfidence,
        });
      }
      inSpeech = false;
      speechProbs = [];
    } else if (inSpeech) {
      speechProbs.push(prob);
    }
  }

  // Handle speech that extends to end of audio
  if (inSpeech) {
    const speechEnd = probabilities.length * secondsPerWindow;
    const durationMs = (speechEnd - speechStart) * 1000;
    if (durationMs >= config.minSpeechDurationMs) {
      const avgConfidence = speechProbs.reduce((a, b) => a + b, 0) / speechProbs.length;
      rawSegments.push({
        start: speechStart,
        end: speechEnd,
        confidence: avgConfidence,
      });
    }
  }

  // Merge segments that are too close together
  const mergedSegments = mergeCloseSegments(rawSegments, config.minSilenceDurationMs / 1000);

  // Apply speech padding
  const paddedSegments = applyPadding(
    mergedSegments,
    config.speechPadMs / 1000,
    probabilities.length * secondsPerWindow // total duration
  );

  return paddedSegments;
}

/**
 * Merge speech segments separated by gaps shorter than minGap
 */
function mergeCloseSegments(segments: SpeechSegment[], minGapSeconds: number): SpeechSegment[] {
  if (segments.length <= 1) return segments;

  const merged: SpeechSegment[] = [{ ...segments[0] }];

  for (let i = 1; i < segments.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = segments[i];

    if (curr.start - prev.end < minGapSeconds) {
      // Merge: extend previous segment to cover current
      prev.end = curr.end;
      prev.confidence = (prev.confidence + curr.confidence) / 2;
    } else {
      merged.push({ ...curr });
    }
  }

  return merged;
}

/**
 * Apply padding around speech segments, clamping to audio boundaries
 */
function applyPadding(
  segments: SpeechSegment[],
  padSeconds: number,
  totalDuration: number
): SpeechSegment[] {
  const padded = segments.map(seg => ({
    ...seg,
    start: Math.max(0, seg.start - padSeconds),
    end: Math.min(totalDuration, seg.end + padSeconds),
  }));

  // Re-merge any overlapping segments after padding
  if (padded.length <= 1) return padded;

  const result: SpeechSegment[] = [{ ...padded[0] }];
  for (let i = 1; i < padded.length; i++) {
    const prev = result[result.length - 1];
    const curr = padded[i];

    if (curr.start <= prev.end) {
      prev.end = Math.max(prev.end, curr.end);
      prev.confidence = (prev.confidence + curr.confidence) / 2;
    } else {
      result.push({ ...curr });
    }
  }

  return result;
}

/**
 * Locate the Silero VAD ONNX model file
 * Checks multiple possible locations where the model might be installed.
 * In Next.js, process.cwd() may differ from the project root, so we also
 * try __dirname-relative paths and require.resolve.
 */
async function getSileroModelPath(): Promise<string | null> {
  // NOTE: We use createRequire() to resolve the package path at runtime,
  // preventing Turbopack from statically tracing into @ricky0123/vad-node
  // and encountering the .onnx file (which the bundler cannot handle).
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createRequire } = require('module');
    const runtimeRequire = createRequire(__filename);
    const pkgMain = runtimeRequire.resolve('@ricky0123/vad-node');
    const pkgDir = path.dirname(pkgMain);
    const onnxPath = path.join(pkgDir, 'silero_vad.onnx');
    if (fs.existsSync(onnxPath)) {
      return onnxPath;
    }
    // Also check parent dir (in case main resolves to a subdirectory)
    const parentOnnxPath = path.join(path.dirname(pkgDir), 'dist', 'silero_vad.onnx');
    if (fs.existsSync(parentOnnxPath)) {
      return parentOnnxPath;
    }
  } catch {
    // Package not resolvable — try manual paths
  }

  const possibleRoots = [
    process.cwd(),
    path.resolve(__dirname, '..', '..'),  // src/lib -> project root
    path.resolve(__dirname, '..', '..', '..'),  // .next/server -> project root
  ];

  for (const root of possibleRoots) {
    const candidates = [
      path.resolve(root, 'node_modules', '@ricky0123', 'vad-node', 'dist', 'silero_vad.onnx'),
      path.resolve(root, 'node_modules', '@ricky0123', 'vad-node', 'dist', 'silero_vad_legacy.onnx'),
      path.resolve(root, 'models', 'silero_vad.onnx'),
      path.resolve(root, 'node_modules', '@ricky0123', 'vad-node', 'silero_vad.onnx'),
    ];

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
  }

  // Last resort: recursive search in the first root that has the vad-node dir
  for (const root of possibleRoots) {
    const vadNodeDir = path.resolve(root, 'node_modules', '@ricky0123', 'vad-node');
    if (fs.existsSync(vadNodeDir)) {
      const files = findOnnxFiles(vadNodeDir);
      if (files.length > 0) {
        const preferred = files.find(f => f.endsWith('silero_vad.onnx') && !f.includes('legacy'));
        return preferred || files[0];
      }
    }
  }

  return null;
}

/**
 * Recursively find .onnx files in a directory
 */
function findOnnxFiles(dir: string, maxDepth: number = 3): string[] {
  const results: string[] = [];
  if (maxDepth <= 0) return results;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith('.onnx')) {
        results.push(fullPath);
      } else if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        results.push(...findOnnxFiles(fullPath, maxDepth - 1));
      }
    }
  } catch {
    // Ignore permission errors
  }

  return results;
}

/**
 * Convert VAD speech segments to silence intervals
 * (inverts speech → silence for compatibility with existing pipeline)
 */
export function speechToSilenceIntervals(
  speechSegments: SpeechSegment[],
  totalDuration: number
): SilenceInterval[] {
  const silences: SilenceInterval[] = [];

  if (speechSegments.length === 0) {
    // No speech detected — entire duration is silence
    return [{ start: 0, end: totalDuration }];
  }

  // Gap before first speech segment
  if (speechSegments[0].start > 0.01) {
    silences.push({ start: 0, end: speechSegments[0].start });
  }

  // Gaps between consecutive speech segments
  for (let i = 0; i < speechSegments.length - 1; i++) {
    const gapStart = speechSegments[i].end;
    const gapEnd = speechSegments[i + 1].start;
    if (gapEnd - gapStart > 0.01) {
      silences.push({ start: gapStart, end: gapEnd });
    }
  }

  // Gap after last speech segment
  const lastSpeech = speechSegments[speechSegments.length - 1];
  if (totalDuration - lastSpeech.end > 0.01) {
    silences.push({ start: lastSpeech.end, end: totalDuration });
  }

  return silences;
}

/**
 * Main entry point: Detect silence using Silero VAD
 *
 * Extracts audio, runs neural VAD, and returns silence intervals
 * compatible with the existing removeSilence pipeline.
 */
export async function detectSilenceWithVad(
  inputPath: string,
  totalDuration: number,
  config: SileroVadConfig = DEFAULT_VAD_CONFIG
): Promise<{
  silences: SilenceInterval[];
  speechSegments: SpeechSegment[];
  analysisInfo: string;
}> {
  const startTime = Date.now();
  const tmpDir = path.dirname(inputPath);
  const baseName = path.basename(inputPath, path.extname(inputPath));
  const wavPath = path.join(tmpDir, `${baseName}_vad_temp.wav`);

  try {
    // Step 1: Extract 16kHz mono WAV
    logger.info('[Silero VAD] Extracting 16kHz mono WAV...');
    await extractWavForVad(inputPath, wavPath);

    // Step 2: Read WAV samples
    const samples = readWavSamples(wavPath);
    logger.info(`[Silero VAD] Loaded ${samples.length} samples (${(samples.length / 16000).toFixed(1)}s)`);

    // Step 3: Run Silero VAD
    const speechSegments = await runSileroVad(samples, 16000, config);

    // Step 4: Convert speech segments to silence intervals
    const silences = speechToSilenceIntervals(speechSegments, totalDuration);

    const totalSilence = silences.reduce((sum, s) => sum + (s.end - s.start), 0);
    const silencePercent = (totalSilence / totalDuration) * 100;
    const elapsedMs = Date.now() - startTime;

    const analysisInfo = `Silero VAD: ${speechSegments.length} speech segments, ${silences.length} silences (${silencePercent.toFixed(1)}%), threshold=${config.threshold}, processed in ${elapsedMs}ms`;
    logger.info(`[Silero VAD] ${analysisInfo}`);

    return { silences, speechSegments, analysisInfo };
  } finally {
    // Clean up temporary WAV file
    try {
      if (fs.existsSync(wavPath)) {
        fs.unlinkSync(wavPath);
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Check if Silero VAD is available (model and runtime installed)
 */
export async function isSileroVadAvailable(): Promise<boolean> {
  try {
    logger.info('[Silero VAD] Checking ONNX runtime availability...');
    await import('onnxruntime-web');
    logger.info('[Silero VAD] ONNX runtime loaded successfully');
  } catch (err) {
    logger.warn(`[Silero VAD] ONNX runtime not available: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }

  try {
    const modelPath = await getSileroModelPath();
    if (!modelPath) {
      logger.warn(`[Silero VAD] ONNX model not found. Searched cwd=${process.cwd()}, __dirname=${__dirname}`);
      return false;
    }
    logger.info(`[Silero VAD] Available (model at ${modelPath})`);
    return true;
  } catch (err) {
    logger.warn(`[Silero VAD] Model path check failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}
