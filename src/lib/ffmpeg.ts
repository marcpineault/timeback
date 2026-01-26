import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { logger } from './logger';

export interface SilenceInterval {
  start: number;
  end: number;
}

export interface ProcessingOptions {
  silenceThreshold?: number; // in dB, default -30
  silenceDuration?: number; // minimum silence duration in seconds, default 0.5
  headline?: string;
  headlinePosition?: 'top' | 'center' | 'bottom';
  captionStyle?: 'instagram';
}

/**
 * Detect silent intervals in a video
 */
export async function detectSilence(
  inputPath: string,
  threshold: number = -20,
  minDuration: number = 0.5
): Promise<SilenceInterval[]> {
  return new Promise((resolve, reject) => {
    const silences: SilenceInterval[] = [];
    let currentSilenceStart: number | null = null;

    logger.debug(`[Silence Detection] Starting with threshold=${threshold}dB, minDuration=${minDuration}s`);

    ffmpeg(inputPath)
      .audioFilters(`silencedetect=noise=${threshold}dB:d=${minDuration}`)
      .format('null')
      .output('/dev/null')
      .on('stderr', (line: string) => {
        // Parse silence_start
        const startMatch = line.match(/silence_start: ([\d.]+)/);
        if (startMatch) {
          currentSilenceStart = parseFloat(startMatch[1]);
          logger.debug(`[Silence Detection] Found silence start at ${currentSilenceStart}s`);
        }

        // Parse silence_end
        const endMatch = line.match(/silence_end: ([\d.]+)/);
        if (endMatch && currentSilenceStart !== null) {
          const endTime = parseFloat(endMatch[1]);
          silences.push({
            start: currentSilenceStart,
            end: endTime,
          });
          logger.debug(`[Silence Detection] Found silence end at ${endTime}s (duration: ${(endTime - currentSilenceStart).toFixed(2)}s)`);
          currentSilenceStart = null;
        }
      })
      .on('end', () => {
        logger.debug(`[Silence Detection] Complete. Found ${silences.length} silent intervals`);
        resolve(silences);
      })
      .on('error', (err) => {
        logger.error(`[Silence Detection] Error:`, err);
        reject(err);
      })
      .run();
  });
}

/**
 * Get video duration
 */
export async function getVideoDuration(inputPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration || 0);
    });
  });
}

/**
 * Calculate non-silent segments from silence intervals
 * Includes padding and filtering for more accurate cuts
 */
export function getNonSilentSegments(
  silences: SilenceInterval[],
  totalDuration: number,
  options: { padding?: number; minSegmentDuration?: number; mergeGap?: number } = {}
): SilenceInterval[] {
  const padding = options.padding ?? 0.05; // 50ms padding around speech
  const minSegmentDuration = options.minSegmentDuration ?? 0.15; // Ignore segments shorter than 150ms
  const mergeGap = options.mergeGap ?? 0.1; // Merge segments less than 100ms apart

  let segments: SilenceInterval[] = [];
  let lastEnd = 0;

  for (const silence of silences) {
    if (silence.start > lastEnd) {
      // Add padding: start slightly earlier, end slightly later
      const paddedStart = Math.max(0, lastEnd - padding);
      const paddedEnd = Math.min(totalDuration, silence.start + padding);
      segments.push({ start: paddedStart, end: paddedEnd });
    }
    lastEnd = silence.end;
  }

  // Add final segment if there's content after last silence
  if (lastEnd < totalDuration) {
    const paddedStart = Math.max(0, lastEnd - padding);
    segments.push({ start: paddedStart, end: totalDuration });
  }

  // Filter out segments that are too short
  segments = segments.filter(seg => (seg.end - seg.start) >= minSegmentDuration);

  // Merge segments that are very close together
  if (segments.length > 1) {
    const mergedSegments: SilenceInterval[] = [segments[0]];
    for (let i = 1; i < segments.length; i++) {
      const prev = mergedSegments[mergedSegments.length - 1];
      const curr = segments[i];

      // If gap between segments is small, merge them
      if (curr.start - prev.end <= mergeGap) {
        prev.end = curr.end;
      } else {
        mergedSegments.push(curr);
      }
    }
    segments = mergedSegments;
  }

  logger.debug(`[Segments] After filtering: ${segments.length} segments (padding=${padding}s, minDuration=${minSegmentDuration}s, mergeGap=${mergeGap}s)`);

  return segments;
}

/**
 * Remove silent parts from video by concatenating non-silent segments
 */
export async function removeSilence(
  inputPath: string,
  outputPath: string,
  options: ProcessingOptions = {}
): Promise<string> {
  const threshold = options.silenceThreshold ?? -20;
  const minDuration = options.silenceDuration ?? 0.5;

  // Detect silences
  const silences = await detectSilence(inputPath, threshold, minDuration);
  const duration = await getVideoDuration(inputPath);

  logger.debug(`[Silence Removal] Video duration: ${duration.toFixed(2)}s`);
  logger.debug(`[Silence Removal] Found ${silences.length} silent intervals`);

  const segments = getNonSilentSegments(silences, duration);

  logger.debug(`[Silence Removal] Non-silent segments to keep: ${segments.length}`);

  if (segments.length === 0) {
    throw new Error('No non-silent segments found in video');
  }

  // If no silences found, just copy the file
  if (silences.length === 0) {
    logger.debug(`[Silence Removal] No silences found, copying original file`);
    fs.copyFileSync(inputPath, outputPath);
    return outputPath;
  }

  // Create filter complex for concatenating segments
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

  logger.debug(`[Silence Removal] Processing ${segments.length} segments...`);

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .complexFilter(filterComplex)
      .outputOptions([
        '-map', '[outv]',
        '-map', '[outa]',
        // Memory-efficient settings for constrained server environments
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-threads', '0',
        '-max_muxing_queue_size', '512',  // Limit muxing buffer
        '-bufsize', '1M',  // Limit rate control buffer
        '-c:a', 'aac',
        '-b:a', '128k',
      ])
      .output(outputPath)
      .on('end', () => {
        logger.debug(`[Silence Removal] Complete!`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        logger.error(`[Silence Removal] Error:`, err);
        reject(err);
      })
      .run();
  });
}

/**
 * Burn captions (subtitles) into video
 */
export async function burnCaptions(
  inputPath: string,
  outputPath: string,
  srtPath: string,
  style: string = 'default'
): Promise<string> {
  // Check if this is an animated ASS file
  const isAnimated = style === 'animated' || srtPath.endsWith('.ass');

  // Caption styles optimized for safe zones
  // FFmpeg subtitles filter uses default PlayRes of 384x288 for SRT files
  // All margin values must be scaled to this coordinate system
  // For 1080x1920 (9:16): Target captions in lower third, avoiding buttons and engagement icons
  // Alignment=2 is bottom-center, MarginV is from bottom edge in PlayRes coordinates
  const styleMap: Record<string, string> = {
    // Instagram style - white text on semi-transparent dark background box
    // Clean, modern, refined look with better readability on busy backgrounds
    // MarginV=69 ≈ 24% from bottom, MarginL=28, MarginR=53 for horizontal padding
    instagram: 'Fontname=Helvetica,FontSize=13,Bold=1,PrimaryColour=&HFFFFFF,BackColour=&H80000000,BorderStyle=4,Outline=0,Shadow=0,Alignment=2,MarginV=69,MarginL=28,MarginR=53',
  };

  logger.debug(`[Captions] Burning captions from: ${srtPath}`);
  logger.debug(`[Captions] Style: ${style}, Animated: ${isAnimated}`);

  // Read and log subtitle content for debugging
  const subContent = fs.readFileSync(srtPath, 'utf-8');
  const lineCount = subContent.split('\n').length;
  logger.debug(`[Captions] Subtitle file has ${lineCount} lines`);

  // Copy subtitle to a temp file with simple name to avoid FFmpeg path escaping issues
  const tempSubName = isAnimated ? 'temp_subs.ass' : 'temp_subs.srt';
  const subDir = path.dirname(srtPath);
  const tempSubPath = path.join(subDir, tempSubName);
  fs.copyFileSync(srtPath, tempSubPath);

  const escapedPath = tempSubPath.replace(/:/g, '\\:').replace(/'/g, "'\\''");

  // For animated ASS files, use the ass filter directly (styles are embedded in the file)
  // For SRT files, use subtitles filter with force_style
  let filterString: string;
  if (isAnimated) {
    filterString = `ass='${escapedPath}'`;
  } else {
    const subtitleStyle = styleMap[style] || styleMap.instagram;
    filterString = `subtitles='${escapedPath}':force_style='${subtitleStyle}'`;
  }
  logger.debug(`[Captions] Filter: ${filterString}`);

  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(inputPath)
      .videoFilters(filterString)
      .outputOptions([
        // Memory-efficient encoding for constrained server environments
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-threads', '0',
        '-max_muxing_queue_size', '512',
        '-bufsize', '1M',
        '-c:a', 'copy',
      ])
      .output(outputPath)
      .on('stderr', (line: string) => {
        if (line.includes('subtitle') || line.includes('Error') || line.includes('error')) {
          logger.debug(`[Captions FFmpeg] ${line}`);
        }
      })
      .on('end', () => {
        logger.debug(`[Captions] Complete!`);
        try { fs.unlinkSync(tempSubPath); } catch {}
        resolve(outputPath);
      })
      .on('error', (err) => {
        logger.error(`[Captions] Error:`, err);
        try { fs.unlinkSync(tempSubPath); } catch {}
        reject(err);
      });

    cmd.run();
  });
}

/**
 * Add headline text overlay to video with platform-native styling
 * Positioned in safe zone: below top 200px, avoiding right 150px for engagement buttons
 */
export async function addHeadline(
  inputPath: string,
  outputPath: string,
  headline: string,
  position: 'top' | 'center' | 'bottom' = 'top',
  captionStyle: string = 'instagram'
): Promise<string> {
  // Y positions optimized for safe zones (1080x1920)
  // Top: y=220 puts headline below username area but in upper third (above speaker's head)
  // Center: middle of frame
  // Bottom: y=1400 is above the bottom safe zone
  const yPositions: Record<string, string> = {
    top: 'y=220',
    center: 'y=(h-text_h)/2',
    bottom: 'y=1400',
  };

  // Escape special characters for FFmpeg drawtext filter
  let escapedHeadline = headline
    .replace(/\\/g, '\\\\')
    .replace(/'/g, '\u2019')
    .replace(/"/g, '\u201d')
    .replace(/:/g, '\\:');

  // Split into two lines if longer than ~25 chars for cleaner look
  if (escapedHeadline.length > 25) {
    const words = escapedHeadline.split(' ');
    const midpoint = Math.ceil(words.length / 2);
    const line1 = words.slice(0, midpoint).join(' ');
    const line2 = words.slice(midpoint).join(' ');
    escapedHeadline = `${line1}\n${line2}`;
  }

  // Platform-native headline styles - clean, simple, and readable
  // x position slightly left of center to avoid right-side engagement buttons
  let filterString: string;

  // Instagram style - clean white on subtle dark background box
  filterString = `drawtext=text='${escapedHeadline}':fontsize=28:fontcolor=white:x=(w-text_w)/2-40:${yPositions[position]}:box=1:boxcolor=black@0.5:boxborderw=12:enable='between(t,0,5)'`;

  logger.debug(`[Headline] Adding headline: "${headline}" at ${position}`);


  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoFilters(filterString)
      .outputOptions([
        // Memory-efficient encoding for constrained server environments
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-threads', '0',
        '-max_muxing_queue_size', '512',
        '-bufsize', '1M',
        '-c:a', 'copy',
      ])
      .output(outputPath)
      .on('end', () => {
        logger.debug(`[Headline] Complete!`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        logger.error(`[Headline] Error:`, err);
        reject(err);
      })
      .run();
  });
}

export interface BRollCutaway {
  timestamp: number;
  duration: number;
  context: string;  // Context text used to generate contextual animation
}

/**
 * Convert an image to a video clip with subtle ken burns effect
 */
export async function imageToVideoClip(
  imagePath: string,
  outputPath: string,
  duration: number,
  videoWidth: number = 1080,
  videoHeight: number = 1920
): Promise<string> {
  logger.debug(`[B-Roll] Converting image to ${duration}s video clip`);

  return new Promise((resolve, reject) => {
    // Ken burns effect: slow zoom in
    const filterComplex = [
      `scale=${videoWidth * 1.1}:${videoHeight * 1.1}`,
      `zoompan=z='min(zoom+0.001,1.1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${duration * 30}:s=${videoWidth}x${videoHeight}:fps=30`
    ].join(',');

    ffmpeg(imagePath)
      .loop(1)
      .inputOptions(['-t', String(duration)])
      .videoFilters(filterComplex)
      .outputOptions([
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-threads', '0',
        '-t', String(duration),
        '-pix_fmt', 'yuv420p',
        '-r', '30',
        '-max_muxing_queue_size', '512',
      ])
      .output(outputPath)
      .on('end', () => {
        logger.debug(`[B-Roll] Video clip created: ${outputPath}`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        logger.error(`[B-Roll] Error creating clip:`, err);
        reject(err);
      })
      .run();
  });
}

/**
 * Insert animated B-roll overlays on top of the video
 */
export async function insertBRollCutaways(
  inputPath: string,
  outputPath: string,
  cutaways: BRollCutaway[],
  outputDir: string
): Promise<string> {
  if (cutaways.length === 0) {
    fs.copyFileSync(inputPath, outputPath);
    return outputPath;
  }

  logger.debug(`[B-Roll] Overlaying ${cutaways.length} animated B-roll clips`);

  // Get video dimensions
  const videoInfo = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) return reject(err);
      const video = metadata.streams.find(s => s.codec_type === 'video');
      resolve({
        width: video?.width || 1080,
        height: video?.height || 1920,
      });
    });
  });

  // Import animation generator
  const { generateContextualAnimation } = await import('./animations');

  // Sort cutaways by timestamp
  const sortedCutaways = [...cutaways].sort((a, b) => a.timestamp - b.timestamp);

  // Generate animation videos for each cutaway
  // Use smaller resolution for animations (will be scaled up during overlay)
  // This significantly reduces memory usage
  const animWidth = Math.floor(videoInfo.width * 0.5);
  const animHeight = Math.floor(videoInfo.height * 0.25);

  // Generate all animations in parallel for better performance
  const animationPaths = await Promise.all(
    sortedCutaways.map(async (cutaway, i) => {
      const animPath = path.join(outputDir, `anim_${i}.mp4`);
      await generateContextualAnimation(
        animPath,
        cutaway.duration,
        animWidth,
        animHeight,
        cutaway.context
      );
      return animPath;
    })
  );

  // Build filter complex for overlaying animations
  const filterParts: string[] = [];
  const inputLabels: string[] = ['0:v'];

  // Add each animation as an input
  for (let i = 0; i < animationPaths.length; i++) {
    inputLabels.push(`${i + 1}:v`);
  }

  let lastOutput = '0:v';

  for (let i = 0; i < sortedCutaways.length; i++) {
    const cutaway = sortedCutaways[i];
    const startTime = cutaway.timestamp;
    const duration = cutaway.duration;
    const fadeTime = 0.3;

    // Target overlay size (centered, 80% of video width, 40% of height)
    const overlayWidth = Math.floor(videoInfo.width * 0.8);
    const overlayHeight = Math.floor(videoInfo.height * 0.4);
    const xPos = Math.floor((videoInfo.width - overlayWidth) / 2);
    const yPos = Math.floor((videoInfo.height - overlayHeight) / 2);

    // Scale from smaller animation to overlay size, then fade
    // Using fast_bilinear for faster scaling with less memory
    filterParts.push(
      `[${i + 1}:v]scale=${overlayWidth}:${overlayHeight}:flags=fast_bilinear,format=rgba,fade=t=in:st=0:d=${fadeTime}:alpha=1,fade=t=out:st=${duration - fadeTime}:d=${fadeTime}:alpha=1[anim${i}]`
    );

    // Overlay on video with time enable
    const inputLabel = lastOutput;
    const outputLabel = i < sortedCutaways.length - 1 ? `tmp${i}` : 'outv';
    filterParts.push(
      `[${inputLabel}][anim${i}]overlay=x=${xPos}:y=${yPos}:enable='between(t,${startTime},${startTime + duration})'[${outputLabel}]`
    );
    lastOutput = outputLabel;
  }

  const filterComplex = filterParts.join(';');
  logger.debug(`[B-Roll] Filter complex: ${filterComplex.substring(0, 200)}...`);

  return new Promise((resolve, reject) => {
    let cmd = ffmpeg(inputPath);

    // Add animation videos as inputs
    for (const animPath of animationPaths) {
      cmd = cmd.input(animPath);
    }

    cmd
      .complexFilter(filterComplex)
      .outputOptions([
        '-map', '[outv]',
        '-map', '0:a',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-threads', '0',
        '-max_muxing_queue_size', '512',
        '-bufsize', '1M',
        '-c:a', 'copy',
      ])
      .output(outputPath)
      .on('end', () => {
        logger.debug(`[B-Roll] Animated overlays added successfully`);
        // Clean up animation files
        for (const animPath of animationPaths) {
          try { fs.unlinkSync(animPath); } catch {}
        }
        resolve(outputPath);
      })
      .on('error', (err) => {
        logger.error(`[B-Roll] Error adding overlays:`, err);
        reject(err);
      })
      .run();
  });
}

/**
 * Normalize audio levels using EBU R128 loudness standard
 * Target: -14 LUFS (optimal for social media platforms)
 */
export async function normalizeAudio(
  inputPath: string,
  outputPath: string
): Promise<string> {
  logger.debug(`[Audio] Normalizing audio levels...`);

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioFilters('loudnorm=I=-14:TP=-1:LRA=11')
      .outputOptions([
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '128k',
      ])
      .output(outputPath)
      .on('end', () => {
        logger.debug(`[Audio] Normalization complete!`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        logger.error(`[Audio] Normalization error:`, err);
        reject(err);
      })
      .run();
  });
}

/**
 * Color grading presets for video enhancement
 */
export type ColorGradePreset = 'none' | 'warm' | 'cool' | 'cinematic' | 'vibrant' | 'vintage';

/**
 * Aspect ratio presets for different platforms
 */
export type AspectRatioPreset = 'original' | '9:16' | '16:9' | '1:1' | '4:5';

export interface AspectRatioInfo {
  name: string;
  ratio: number; // width/height
  platforms: string[];
}

export const ASPECT_RATIOS: Record<AspectRatioPreset, AspectRatioInfo> = {
  'original': { name: 'Original', ratio: 0, platforms: ['Keep original'] },
  '9:16': { name: 'Vertical', ratio: 9/16, platforms: ['Reels', 'Shorts'] },
  '16:9': { name: 'Landscape', ratio: 16/9, platforms: ['YouTube', 'Twitter'] },
  '1:1': { name: 'Square', ratio: 1, platforms: ['Instagram Feed'] },
  '4:5': { name: 'Portrait', ratio: 4/5, platforms: ['Instagram', 'Facebook'] },
};

/**
 * Convert video to a different aspect ratio using blur background padding
 * This preserves all content by adding blurred edges instead of cropping
 */
export async function convertAspectRatio(
  inputPath: string,
  outputPath: string,
  targetRatio: AspectRatioPreset
): Promise<string> {
  if (targetRatio === 'original') {
    logger.debug(`[Aspect] Keeping original aspect ratio`);
    fs.copyFileSync(inputPath, outputPath);
    return outputPath;
  }

  // Get video dimensions
  const videoInfo = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) return reject(err);
      const video = metadata.streams.find(s => s.codec_type === 'video');
      resolve({
        width: video?.width || 1920,
        height: video?.height || 1080,
      });
    });
  });

  const currentRatio = videoInfo.width / videoInfo.height;
  const targetRatioValue = ASPECT_RATIOS[targetRatio].ratio;

  logger.debug(`[Aspect] Converting from ${currentRatio.toFixed(2)} to ${targetRatioValue.toFixed(2)} (${targetRatio})`);

  // Calculate target dimensions (keep the larger dimension, adjust the other)
  let targetWidth: number;
  let targetHeight: number;

  if (targetRatioValue > currentRatio) {
    // Target is wider - keep height, add width
    targetHeight = videoInfo.height;
    targetWidth = Math.round(targetHeight * targetRatioValue);
  } else {
    // Target is taller - keep width, add height
    targetWidth = videoInfo.width;
    targetHeight = Math.round(targetWidth / targetRatioValue);
  }

  // Ensure dimensions are even (required for most codecs)
  targetWidth = targetWidth + (targetWidth % 2);
  targetHeight = targetHeight + (targetHeight % 2);

  logger.debug(`[Aspect] Original: ${videoInfo.width}x${videoInfo.height}, Target: ${targetWidth}x${targetHeight}`);

  // Build filter for blur background padding
  // This creates a blurred, scaled-up version of the video as background
  // Then overlays the original centered on top
  const filterComplex = [
    // Create blurred background - scale to fill, apply heavy blur
    `[0:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},boxblur=20:5[bg]`,
    // Scale original to fit within target (with letterbox/pillarbox)
    `[0:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease[fg]`,
    // Overlay centered original on blurred background
    `[bg][fg]overlay=(W-w)/2:(H-h)/2[out]`
  ].join(';');

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .complexFilter(filterComplex, 'out')
      .outputOptions([
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-threads', '0',
        '-max_muxing_queue_size', '512',
        '-c:a', 'copy',
      ])
      .output(outputPath)
      .on('end', () => {
        logger.debug(`[Aspect] Conversion complete!`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        logger.error(`[Aspect] Conversion error:`, err);
        reject(err);
      })
      .run();
  });
}

const colorGradeFilters: Record<ColorGradePreset, string> = {
  none: '',
  warm: 'colorbalance=rs=0.15:gs=0.05:bs=-0.1:rm=0.1:gm=0.05:bm=-0.05',
  cool: 'colorbalance=rs=-0.1:gs=0:bs=0.15:rm=-0.05:gm=0.05:bm=0.1',
  cinematic: 'colorbalance=rs=0.1:gs=-0.05:bs=-0.1,eq=contrast=1.1:brightness=-0.05:saturation=0.9',
  vibrant: 'eq=saturation=1.4:contrast=1.1:brightness=0.02',
  vintage: 'colorbalance=rs=0.2:gs=0.1:bs=-0.15,eq=saturation=0.85:contrast=1.05',
};

/**
 * Combined video processing options for single-pass encoding
 * This reduces multiple FFmpeg passes to a single pass when possible
 */
export interface CombinedProcessingOptions {
  colorGrade?: ColorGradePreset;
  headline?: string;
  headlinePosition?: 'top' | 'center' | 'bottom';
  captionStyle?: string;
}

/**
 * Apply multiple video filters in a single FFmpeg pass
 * This is more efficient than running separate passes for each filter
 * Combines color grading and headline into one re-encode
 */
export async function applyCombinedFilters(
  inputPath: string,
  outputPath: string,
  options: CombinedProcessingOptions
): Promise<string> {
  const filters: string[] = [];

  // Add color grading filter if specified
  if (options.colorGrade && options.colorGrade !== 'none') {
    const colorFilter = colorGradeFilters[options.colorGrade];
    if (colorFilter) {
      filters.push(colorFilter);
    }
  }

  // Add headline filter if specified (with platform-native styling, safe zone optimized)
  if (options.headline) {
    // Y positions optimized for safe zones (1080x1920)
    const yPositions: Record<string, string> = {
      top: 'y=220',
      center: 'y=(h-text_h)/2',
      bottom: 'y=1400',
    };

    let escapedHeadline = options.headline
      .replace(/\\/g, '\\\\')
      .replace(/'/g, '\u2019')
      .replace(/"/g, '\u201d')
      .replace(/:/g, '\\:');

    // Split into two lines if longer than ~25 chars
    if (escapedHeadline.length > 25) {
      const words = escapedHeadline.split(' ');
      const midpoint = Math.ceil(words.length / 2);
      const line1 = words.slice(0, midpoint).join(' ');
      const line2 = words.slice(midpoint).join(' ');
      escapedHeadline = `${line1}\n${line2}`;
    }

    const position = options.headlinePosition || 'top';

    // Instagram style - clean white on subtle dark background box
    const headlineFilter = `drawtext=text='${escapedHeadline}':fontsize=28:fontcolor=white:x=(w-text_w)/2-40:${yPositions[position]}:box=1:boxcolor=black@0.5:boxborderw=12:enable='between(t,0,5)'`;
    filters.push(headlineFilter);
  }

  // If no filters to apply, just copy the file
  if (filters.length === 0) {
    logger.debug('[Combined] No filters to apply, copying file');
    fs.copyFileSync(inputPath, outputPath);
    return outputPath;
  }

  const filterString = filters.join(',');
  logger.debug(`[Combined] Applying ${filters.length} filters in single pass`);

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoFilters(filterString)
      .outputOptions([
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-threads', '0',
        '-max_muxing_queue_size', '512',
        '-bufsize', '1M',
        '-c:a', 'copy',
      ])
      .output(outputPath)
      .on('end', () => {
        logger.debug(`[Combined] Processing complete!`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        logger.error(`[Combined] Error:`, err);
        reject(err);
      })
      .run();
  });
}

/**
 * Apply color grading preset to video
 */
export async function applyColorGrade(
  inputPath: string,
  outputPath: string,
  preset: ColorGradePreset
): Promise<string> {
  if (preset === 'none') {
    logger.debug(`[Color] No color grading applied`);
    fs.copyFileSync(inputPath, outputPath);
    return outputPath;
  }

  logger.debug(`[Color] Applying ${preset} color grade...`);
  const filterString = colorGradeFilters[preset];

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoFilters(filterString)
      .outputOptions([
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-threads', '0',
        '-c:a', 'copy',
      ])
      .output(outputPath)
      .on('end', () => {
        logger.debug(`[Color] Color grading complete!`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        logger.error(`[Color] Color grading error:`, err);
        reject(err);
      })
      .run();
  });
}

/**
 * Apply auto-zoom effect during speech segments
 * Creates a subtle "punch in" effect during speaking to increase engagement
 */
export async function applyAutoZoom(
  inputPath: string,
  outputPath: string,
  segments: { start: number; end: number }[],
  zoomIntensity: number = 1.05
): Promise<string> {
  if (segments.length === 0) {
    logger.debug(`[Zoom] No segments provided, skipping auto-zoom`);
    fs.copyFileSync(inputPath, outputPath);
    return outputPath;
  }

  logger.debug(`[Zoom] Applying auto-zoom to ${segments.length} speech segments (intensity: ${zoomIntensity}x)...`);

  // Get video info for dimensions
  const videoInfo = await new Promise<{ width: number; height: number; duration: number }>((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) return reject(err);
      const video = metadata.streams.find(s => s.codec_type === 'video');
      resolve({
        width: video?.width || 1080,
        height: video?.height || 1920,
        duration: metadata.format.duration || 0,
      });
    });
  });

  // Build zoom expression that activates during speech segments
  // Use simpler approach: scale + crop with conditional zoom based on time
  // Limit to first 20 segments to avoid overly complex expressions
  const limitedSegments = segments.slice(0, 20);

  const zoomConditions = limitedSegments
    .map(seg => `between(t\\,${seg.start.toFixed(2)}\\,${seg.end.toFixed(2)})`)
    .join('+');

  // Calculate zoom factor (e.g., 1.05 = 5% zoom)
  const zoomFactor = zoomIntensity;
  const scaledWidth = Math.round(videoInfo.width * zoomFactor);
  const scaledHeight = Math.round(videoInfo.height * zoomFactor);

  // Use scale and crop for zoom effect - simpler and more reliable than zoompan
  // When speaking: scale up and crop to center
  // When not speaking: use original
  const filterComplex = [
    `[0:v]split=2[orig][zoom]`,
    `[zoom]scale=${scaledWidth}:${scaledHeight},crop=${videoInfo.width}:${videoInfo.height}[zoomed]`,
    `[orig][zoomed]overlay=x='if(${zoomConditions},0,W)':y=0:shortest=1[out]`
  ].join(';');

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .complexFilter(filterComplex, 'out')
      .outputOptions([
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
      ])
      .output(outputPath)
      .on('end', () => {
        logger.debug(`[Zoom] Auto-zoom complete!`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        logger.error(`[Zoom] Auto-zoom error:`, err);
        // Graceful fallback: just copy the file if zoom fails
        logger.debug(`[Zoom] Falling back to original video without zoom`);
        try {
          fs.copyFileSync(inputPath, outputPath);
          resolve(outputPath);
        } catch (copyErr) {
          reject(err);
        }
      })
      .run();
  });
}

/**
 * Trim video to specified start and end times
 */
export async function trimVideo(
  inputPath: string,
  outputPath: string,
  startTime: number,
  endTime: number
): Promise<string> {
  const duration = endTime - startTime;

  logger.debug(`[Trim] Trimming video from ${startTime.toFixed(2)}s to ${endTime.toFixed(2)}s (duration: ${duration.toFixed(2)}s)`);

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .setStartTime(startTime)
      .setDuration(duration)
      .outputOptions([
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-threads', '0',
        '-max_muxing_queue_size', '512',
        '-bufsize', '1M',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-avoid_negative_ts', 'make_zero',
      ])
      .output(outputPath)
      .on('end', () => {
        logger.debug(`[Trim] Complete!`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        logger.error(`[Trim] Error:`, err);
        reject(err);
      })
      .run();
  });
}

export interface SplitSegment {
  startTime: number;
  endTime: number;
  outputPath: string;
}

/**
 * Split video into multiple segments at specified timestamps
 */
export async function splitVideo(
  inputPath: string,
  outputDir: string,
  splitPoints: number[],
  baseFilename: string
): Promise<string[]> {
  // Get video duration
  const duration = await getVideoDuration(inputPath);

  // Create segments from split points
  const allPoints = [0, ...splitPoints.sort((a, b) => a - b), duration];
  const segments: SplitSegment[] = [];

  for (let i = 0; i < allPoints.length - 1; i++) {
    const startTime = allPoints[i];
    const endTime = allPoints[i + 1];
    const outputPath = path.join(outputDir, `${baseFilename}_part${i + 1}.mp4`);
    segments.push({ startTime, endTime, outputPath });
  }

  logger.debug(`[Split] Splitting video into ${segments.length} parts`);

  const outputPaths: string[] = [];

  for (const segment of segments) {
    const segmentDuration = segment.endTime - segment.startTime;
    logger.debug(`[Split] Creating part: ${segment.startTime.toFixed(2)}s - ${segment.endTime.toFixed(2)}s`);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .setStartTime(segment.startTime)
        .setDuration(segmentDuration)
        .outputOptions([
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '28',
          '-threads', '0',
          '-max_muxing_queue_size', '512',
          '-bufsize', '1M',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-avoid_negative_ts', 'make_zero',
        ])
        .output(segment.outputPath)
        .on('end', () => {
          logger.debug(`[Split] Part created: ${segment.outputPath}`);
          outputPaths.push(segment.outputPath);
          resolve();
        })
        .on('error', (err) => {
          logger.error(`[Split] Error:`, err);
          reject(err);
        })
        .run();
    });
  }

  logger.debug(`[Split] Complete! Created ${outputPaths.length} parts`);
  return outputPaths;
}

/**
 * Full processing pipeline: remove silence, add captions, add headline
 */
export async function processVideo(
  inputPath: string,
  outputDir: string,
  srtPath?: string,
  options: ProcessingOptions = {}
): Promise<string> {
  const baseName = path.basename(inputPath, path.extname(inputPath));
  let currentInput = inputPath;
  let stepOutput: string;

  // Step 1: Remove silence
  stepOutput = path.join(outputDir, `${baseName}_nosilence.mp4`);
  await removeSilence(currentInput, stepOutput, options);
  currentInput = stepOutput;

  // Step 2: Burn captions if SRT provided
  if (srtPath && fs.existsSync(srtPath)) {
    stepOutput = path.join(outputDir, `${baseName}_captioned.mp4`);
    await burnCaptions(currentInput, stepOutput, srtPath, options.captionStyle);
    // Clean up intermediate file
    if (currentInput !== inputPath) fs.unlinkSync(currentInput);
    currentInput = stepOutput;
  }

  // Step 3: Add headline if provided
  if (options.headline) {
    stepOutput = path.join(outputDir, `${baseName}_final.mp4`);
    await addHeadline(currentInput, stepOutput, options.headline, options.headlinePosition, options.captionStyle);
    // Clean up intermediate file
    if (currentInput !== inputPath) fs.unlinkSync(currentInput);
    currentInput = stepOutput;
  }

  // Rename to final output if needed
  const finalOutput = path.join(outputDir, `${baseName}_processed.mp4`);
  if (currentInput !== finalOutput) {
    fs.renameSync(currentInput, finalOutput);
  }

  return finalOutput;
}
