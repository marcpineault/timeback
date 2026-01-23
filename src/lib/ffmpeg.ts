import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';

export interface SilenceInterval {
  start: number;
  end: number;
}

export interface ProcessingOptions {
  silenceThreshold?: number; // in dB, default -30
  silenceDuration?: number; // minimum silence duration in seconds, default 0.5
  headline?: string;
  headlinePosition?: 'top' | 'center' | 'bottom';
  captionStyle?: 'default' | 'bold' | 'outline';
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

    console.log(`[Silence Detection] Starting with threshold=${threshold}dB, minDuration=${minDuration}s`);

    ffmpeg(inputPath)
      .audioFilters(`silencedetect=noise=${threshold}dB:d=${minDuration}`)
      .format('null')
      .output('/dev/null')
      .on('stderr', (line: string) => {
        // Parse silence_start
        const startMatch = line.match(/silence_start: ([\d.]+)/);
        if (startMatch) {
          currentSilenceStart = parseFloat(startMatch[1]);
          console.log(`[Silence Detection] Found silence start at ${currentSilenceStart}s`);
        }

        // Parse silence_end
        const endMatch = line.match(/silence_end: ([\d.]+)/);
        if (endMatch && currentSilenceStart !== null) {
          const endTime = parseFloat(endMatch[1]);
          silences.push({
            start: currentSilenceStart,
            end: endTime,
          });
          console.log(`[Silence Detection] Found silence end at ${endTime}s (duration: ${(endTime - currentSilenceStart).toFixed(2)}s)`);
          currentSilenceStart = null;
        }
      })
      .on('end', () => {
        console.log(`[Silence Detection] Complete. Found ${silences.length} silent intervals`);
        resolve(silences);
      })
      .on('error', (err) => {
        console.error(`[Silence Detection] Error:`, err);
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

  console.log(`[Segments] After filtering: ${segments.length} segments (padding=${padding}s, minDuration=${minSegmentDuration}s, mergeGap=${mergeGap}s)`);

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

  console.log(`[Silence Removal] Video duration: ${duration.toFixed(2)}s`);
  console.log(`[Silence Removal] Found ${silences.length} silent intervals`);

  const segments = getNonSilentSegments(silences, duration);

  console.log(`[Silence Removal] Non-silent segments to keep:`);
  segments.forEach((seg, i) => {
    console.log(`  Segment ${i + 1}: ${seg.start.toFixed(2)}s - ${seg.end.toFixed(2)}s (${(seg.end - seg.start).toFixed(2)}s)`);
  });

  if (segments.length === 0) {
    throw new Error('No non-silent segments found in video');
  }

  // If no silences found, just copy the file
  if (silences.length === 0) {
    console.log(`[Silence Removal] No silences found, copying original file`);
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

  console.log(`[Silence Removal] Processing ${segments.length} segments...`);

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
        '-threads', '1',
        '-max_muxing_queue_size', '512',  // Limit muxing buffer
        '-bufsize', '1M',  // Limit rate control buffer
        '-c:a', 'aac',
        '-b:a', '96k',
      ])
      .output(outputPath)
      .on('end', () => {
        console.log(`[Silence Removal] Complete!`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error(`[Silence Removal] Error:`, err);
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

  // Clean centered captions - minimal style
  // Alignment=2 is bottom-center, MarginV positions vertically
  // MarginL/MarginR add horizontal padding for Instagram Reels safe zone (~100px each side)
  // This keeps captions within ~880px center width on 1080px video
  const styleMap: Record<string, string> = {
    // Default: clean, small white text with subtle shadow for readability
    default: 'Fontname=Arial,FontSize=10,Bold=0,PrimaryColour=&HFFFFFF,OutlineColour=&H80000000,Outline=1,Shadow=1,Alignment=2,MarginV=100,MarginL=100,MarginR=100',
    // Bold style
    bold: 'Fontname=Arial,FontSize=11,Bold=1,PrimaryColour=&HFFFFFF,OutlineColour=&H80000000,Outline=1,Shadow=1,Alignment=2,MarginV=100,MarginL=100,MarginR=100',
    // Outline style
    outline: 'Fontname=Arial,FontSize=10,Bold=0,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=1,Shadow=0,Alignment=2,MarginV=100,MarginL=100,MarginR=100',
  };

  console.log(`[Captions] Burning captions from: ${srtPath}`);
  console.log(`[Captions] Style: ${style}, Animated: ${isAnimated}`);

  // Read and log subtitle content for debugging
  const subContent = fs.readFileSync(srtPath, 'utf-8');
  const lineCount = subContent.split('\n').length;
  console.log(`[Captions] Subtitle file has ${lineCount} lines`);

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
    const subtitleStyle = styleMap[style] || styleMap.default;
    filterString = `subtitles='${escapedPath}':force_style='${subtitleStyle}'`;
  }
  console.log(`[Captions] Filter: ${filterString}`);

  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(inputPath)
      .videoFilters(filterString)
      .outputOptions([
        // Memory-efficient encoding for constrained server environments
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-threads', '1',
        '-max_muxing_queue_size', '512',
        '-bufsize', '1M',
        '-c:a', 'copy',
      ])
      .output(outputPath)
      .on('stderr', (line: string) => {
        if (line.includes('subtitle') || line.includes('Error') || line.includes('error')) {
          console.log(`[Captions FFmpeg] ${line}`);
        }
      })
      .on('end', () => {
        console.log(`[Captions] Complete!`);
        try { fs.unlinkSync(tempSubPath); } catch {}
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error(`[Captions] Error:`, err);
        try { fs.unlinkSync(tempSubPath); } catch {}
        reject(err);
      });

    cmd.run();
  });
}

/**
 * Add headline text overlay to video with background box
 */
export async function addHeadline(
  inputPath: string,
  outputPath: string,
  headline: string,
  position: 'top' | 'center' | 'bottom' = 'top'
): Promise<string> {
  // Y positions for the text
  const yPositions: Record<string, string> = {
    top: 'y=240',
    center: 'y=(h-text_h)/2',
    bottom: 'y=h-text_h-240',
  };

  // Escape special characters for FFmpeg drawtext filter
  // Replace apostrophes and quotes, escape colons and backslashes
  let escapedHeadline = headline
    .replace(/\\/g, '\\\\')
    .replace(/'/g, '\u2019')  // Replace apostrophe with unicode right single quote
    .replace(/"/g, '\u201d')  // Replace double quote with unicode right double quote
    .replace(/:/g, '\\:');

  // Split into two lines if longer than ~30 chars
  if (escapedHeadline.length > 30) {
    const words = escapedHeadline.split(' ');
    const midpoint = Math.ceil(words.length / 2);
    const line1 = words.slice(0, midpoint).join(' ');
    const line2 = words.slice(midpoint).join(' ');
    escapedHeadline = `${line1}\n${line2}`;
  }

  // Use drawtext with box option for background
  // Using sans-serif font (works on Linux/Docker), thin box padding for reels
  // Only show for first 5 seconds with enable='between(t,0,5)'
  const filterString = `drawtext=text='${escapedHeadline}':fontsize=40:fontcolor=white:x=(w-text_w)/2:${yPositions[position]}:box=1:boxcolor=black@0.75:boxborderw=12:enable='between(t,0,5)'`;

  console.log(`[Headline] Adding headline: "${headline}" at ${position}`);

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoFilters(filterString)
      .outputOptions([
        // Memory-efficient encoding for constrained server environments
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-threads', '1',
        '-max_muxing_queue_size', '512',
        '-bufsize', '1M',
        '-c:a', 'copy',
      ])
      .output(outputPath)
      .on('end', () => {
        console.log(`[Headline] Complete!`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error(`[Headline] Error:`, err);
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
  console.log(`[B-Roll] Converting image to ${duration}s video clip`);

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
        '-threads', '1',
        '-t', String(duration),
        '-pix_fmt', 'yuv420p',
        '-r', '30',
        '-max_muxing_queue_size', '512',
      ])
      .output(outputPath)
      .on('end', () => {
        console.log(`[B-Roll] Video clip created: ${outputPath}`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error(`[B-Roll] Error creating clip:`, err);
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

  console.log(`[B-Roll] Overlaying ${cutaways.length} animated B-roll clips`);

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

  const animationPaths: string[] = [];
  for (let i = 0; i < sortedCutaways.length; i++) {
    const cutaway = sortedCutaways[i];
    const animPath = path.join(outputDir, `anim_${i}.mp4`);

    // Generate contextual animation based on the context
    // Using reduced resolution to save memory
    await generateContextualAnimation(
      animPath,
      cutaway.duration,
      animWidth,
      animHeight,
      cutaway.context
    );
    animationPaths.push(animPath);
  }

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
  console.log(`[B-Roll] Filter complex: ${filterComplex.substring(0, 200)}...`);

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
        '-threads', '1',
        '-max_muxing_queue_size', '512',
        '-bufsize', '1M',
        '-c:a', 'copy',
      ])
      .output(outputPath)
      .on('end', () => {
        console.log(`[B-Roll] Animated overlays added successfully`);
        // Clean up animation files
        for (const animPath of animationPaths) {
          try { fs.unlinkSync(animPath); } catch {}
        }
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error(`[B-Roll] Error adding overlays:`, err);
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
  console.log(`[Audio] Normalizing audio levels...`);

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
        console.log(`[Audio] Normalization complete!`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error(`[Audio] Normalization error:`, err);
        reject(err);
      })
      .run();
  });
}

/**
 * Color grading presets for video enhancement
 */
export type ColorGradePreset = 'none' | 'warm' | 'cool' | 'cinematic' | 'vibrant' | 'vintage';

const colorGradeFilters: Record<ColorGradePreset, string> = {
  none: '',
  warm: 'colorbalance=rs=0.15:gs=0.05:bs=-0.1:rm=0.1:gm=0.05:bm=-0.05',
  cool: 'colorbalance=rs=-0.1:gs=0:bs=0.15:rm=-0.05:gm=0.05:bm=0.1',
  cinematic: 'colorbalance=rs=0.1:gs=-0.05:bs=-0.1,eq=contrast=1.1:brightness=-0.05:saturation=0.9',
  vibrant: 'eq=saturation=1.4:contrast=1.1:brightness=0.02',
  vintage: 'colorbalance=rs=0.2:gs=0.1:bs=-0.15,eq=saturation=0.85:contrast=1.05',
};

/**
 * Apply color grading preset to video
 */
export async function applyColorGrade(
  inputPath: string,
  outputPath: string,
  preset: ColorGradePreset
): Promise<string> {
  if (preset === 'none') {
    console.log(`[Color] No color grading applied`);
    fs.copyFileSync(inputPath, outputPath);
    return outputPath;
  }

  console.log(`[Color] Applying ${preset} color grade...`);
  const filterString = colorGradeFilters[preset];

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoFilters(filterString)
      .outputOptions([
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-threads', '1',
        '-c:a', 'copy',
      ])
      .output(outputPath)
      .on('end', () => {
        console.log(`[Color] Color grading complete!`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error(`[Color] Color grading error:`, err);
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
    console.log(`[Zoom] No segments provided, skipping auto-zoom`);
    fs.copyFileSync(inputPath, outputPath);
    return outputPath;
  }

  console.log(`[Zoom] Applying auto-zoom to ${segments.length} speech segments (intensity: ${zoomIntensity}x)...`);

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
  // Format: if(between(t,start,end),zoom,1)
  const zoomConditions = segments
    .map(seg => `between(t,${seg.start.toFixed(2)},${seg.end.toFixed(2)})`)
    .join('+');

  // Smooth zoom using expression: lerp towards target when speaking, lerp back when not
  // This creates a gradual zoom in/out effect
  const zoomExpr = `if(${zoomConditions},min(zoom+0.002,${zoomIntensity}),max(zoom-0.002,1))`;

  // Center the zoom on the frame
  const xExpr = `iw/2-(iw/zoom/2)`;
  const yExpr = `ih/2-(ih/zoom/2)`;

  // Use zoompan filter for smooth animated zoom
  const filterString = `zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=1:s=${videoInfo.width}x${videoInfo.height}:fps=30`;

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoFilters(filterString)
      .outputOptions([
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-threads', '1',
        '-c:a', 'copy',
      ])
      .output(outputPath)
      .on('end', () => {
        console.log(`[Zoom] Auto-zoom complete!`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error(`[Zoom] Auto-zoom error:`, err);
        reject(err);
      })
      .run();
  });
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
    await addHeadline(currentInput, stepOutput, options.headline, options.headlinePosition);
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
