import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';

export type AnimationType = 'graph_up' | 'graph_down' | 'counter' | 'pulse' | 'particles';

export interface AnimationConfig {
  type: AnimationType;
  duration: number;
  width: number;
  height: number;
  color?: string;
  text?: string;
}

/**
 * Generate an animated graph going up using FFmpeg
 */
export async function generateGraphAnimation(
  outputPath: string,
  duration: number,
  width: number,
  height: number,
  direction: 'up' | 'down' = 'up'
): Promise<string> {
  console.log(`[Animation] Generating ${direction} graph animation`);

  const fps = 30;
  const totalFrames = duration * fps;
  const color = direction === 'up' ? '0x00FF00' : '0xFF0000'; // Green for up, red for down
  const bgColor = '0x1a1a2e';

  // Create animated graph using geq (generic equation) filter
  // This draws a line that animates over time
  const filterComplex = direction === 'up'
    ? [
        // Dark background
        `color=c=${bgColor}:s=${width}x${height}:d=${duration}`,
        // Draw animated rising line graph
        `geq=lum='if(gt(Y,H-H*0.1-H*0.7*(X/W)*(N/${totalFrames})),16,235)':cb=128:cr=128`,
        // Add green tint to the graph area
        `colorbalance=gs=0.5:gm=0.3`,
        // Add glow effect
        `gblur=sigma=2`,
      ].join(',')
    : [
        // Dark background
        `color=c=${bgColor}:s=${width}x${height}:d=${duration}`,
        // Draw animated falling line graph
        `geq=lum='if(gt(Y,H*0.1+H*0.7*(X/W)*(N/${totalFrames})),235,16)':cb=128:cr=128`,
        // Add red tint
        `colorbalance=rs=0.5:rm=0.3`,
        `gblur=sigma=2`,
      ].join(',');

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input('color=black:s=' + width + 'x' + height + ':d=' + duration)
      .inputFormat('lavfi')
      .complexFilter([
        // Create gradient background
        `color=c=0x0f0f23:s=${width}x${height}:d=${duration}[bg]`,
        // Create animated line
        `color=c=black:s=${width}x${height}:d=${duration},geq=r='if(between(Y,H-H*0.15-H*0.6*pow(X/W,0.7)*(N/${totalFrames})-5,H-H*0.15-H*0.6*pow(X/W,0.7)*(N/${totalFrames})+5),${direction === 'up' ? 100 : 255},15)':g='if(between(Y,H-H*0.15-H*0.6*pow(X/W,0.7)*(N/${totalFrames})-5,H-H*0.15-H*0.6*pow(X/W,0.7)*(N/${totalFrames})+5),${direction === 'up' ? 255 : 50},20)':b='if(between(Y,H-H*0.15-H*0.6*pow(X/W,0.7)*(N/${totalFrames})-5,H-H*0.15-H*0.6*pow(X/W,0.7)*(N/${totalFrames})+5),100,30)'[line]`,
        // Composite
        `[bg][line]overlay=0:0:format=auto[out]`
      ])
      .outputOptions([
        '-map', '[out]',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '30',
        '-threads', '1',
        '-t', String(duration),
        '-pix_fmt', 'yuv420p',
        '-r', String(fps),
        '-max_muxing_queue_size', '512',
      ])
      .output(outputPath)
      .on('end', () => {
        console.log(`[Animation] Graph animation created: ${outputPath}`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error(`[Animation] Error:`, err);
        reject(err);
      })
      .run();
  });
}

/**
 * Generate animated counter/number going up
 */
export async function generateCounterAnimation(
  outputPath: string,
  duration: number,
  width: number,
  height: number,
  startValue: number = 0,
  endValue: number = 1000000,
  prefix: string = '$'
): Promise<string> {
  console.log(`[Animation] Generating counter animation ${startValue} -> ${endValue}`);

  const fps = 30;

  // FFmpeg drawtext with expression for animated number
  const filterComplex = [
    `color=c=0x0f0f23:s=${width}x${height}:d=${duration}`,
    `drawtext=text='${prefix}%{eif\\:${startValue}+${endValue - startValue}*t/${duration}\\:d}':fontsize=${Math.floor(height * 0.15)}:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:fontfile=/System/Library/Fonts/Helvetica.ttc`,
  ].join(',');

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(`color=black:s=${width}x${height}:d=${duration}`)
      .inputFormat('lavfi')
      .videoFilters(filterComplex)
      .outputOptions([
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '30',
        '-threads', '1',
        '-t', String(duration),
        '-pix_fmt', 'yuv420p',
        '-r', String(fps),
        '-max_muxing_queue_size', '512',
      ])
      .output(outputPath)
      .on('end', () => {
        console.log(`[Animation] Counter animation created: ${outputPath}`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error(`[Animation] Error:`, err);
        reject(err);
      })
      .run();
  });
}

/**
 * Generate pulsing/breathing circle animation
 */
export async function generatePulseAnimation(
  outputPath: string,
  duration: number,
  width: number,
  height: number,
  color: string = '00ff88'
): Promise<string> {
  console.log(`[Animation] Generating pulse animation`);

  const fps = 30;
  const centerX = width / 2;
  const centerY = height / 2;
  const maxRadius = Math.min(width, height) * 0.3;

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(`color=c=0x0f0f23:s=${width}x${height}:d=${duration}`)
      .inputFormat('lavfi')
      .complexFilter([
        // Create pulsing circle using geq
        `geq=r='if(lt(sqrt(pow(X-${centerX},2)+pow(Y-${centerY},2)),${maxRadius}*(0.5+0.5*sin(2*PI*N/30))),0x${color.substring(0, 2)},15)':g='if(lt(sqrt(pow(X-${centerX},2)+pow(Y-${centerY},2)),${maxRadius}*(0.5+0.5*sin(2*PI*N/30))),0x${color.substring(2, 4)},15)':b='if(lt(sqrt(pow(X-${centerX},2)+pow(Y-${centerY},2)),${maxRadius}*(0.5+0.5*sin(2*PI*N/30))),0x${color.substring(4, 6)},25)'[out]`
      ])
      .outputOptions([
        '-map', '[out]',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '30',
        '-threads', '1',
        '-t', String(duration),
        '-pix_fmt', 'yuv420p',
        '-r', String(fps),
        '-max_muxing_queue_size', '512',
      ])
      .output(outputPath)
      .on('end', () => {
        console.log(`[Animation] Pulse animation created: ${outputPath}`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error(`[Animation] Error:`, err);
        reject(err);
      })
      .run();
  });
}

/**
 * Generate particle/sparkle animation
 */
export async function generateParticleAnimation(
  outputPath: string,
  duration: number,
  width: number,
  height: number
): Promise<string> {
  console.log(`[Animation] Generating particle animation`);

  const fps = 30;

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(`color=c=0x0f0f23@0.8:s=${width}x${height}:d=${duration}`)
      .inputFormat('lavfi')
      .complexFilter([
        // Create noise-based particles that rise up
        `noise=alls=50:allf=t,geq=lum='if(gt(lum(X,Y),200)*random(1),255,0)':cb=128:cr=128,format=rgba,fade=t=in:st=0:d=0.5:alpha=1,fade=t=out:st=${duration - 0.5}:d=0.5:alpha=1[out]`
      ])
      .outputOptions([
        '-map', '[out]',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '30',
        '-threads', '1',
        '-t', String(duration),
        '-pix_fmt', 'yuva420p',
        '-r', String(fps),
        '-max_muxing_queue_size', '512',
      ])
      .output(outputPath)
      .on('end', () => {
        console.log(`[Animation] Particle animation created: ${outputPath}`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error(`[Animation] Error:`, err);
        reject(err);
      })
      .run();
  });
}

/**
 * Generate animation based on context from transcript
 */
export async function generateContextualAnimation(
  outputPath: string,
  duration: number,
  width: number,
  height: number,
  context: string
): Promise<string> {
  // Analyze context to determine best animation type
  const lowerContext = context.toLowerCase();

  if (lowerContext.includes('growth') || lowerContext.includes('increase') || lowerContext.includes('up') || lowerContext.includes('rise') || lowerContext.includes('profit') || lowerContext.includes('success')) {
    return generateGraphAnimation(outputPath, duration, width, height, 'up');
  }

  if (lowerContext.includes('crash') || lowerContext.includes('fall') || lowerContext.includes('down') || lowerContext.includes('loss') || lowerContext.includes('decline')) {
    return generateGraphAnimation(outputPath, duration, width, height, 'down');
  }

  if (lowerContext.includes('money') || lowerContext.includes('dollar') || lowerContext.includes('revenue') || lowerContext.includes('income') || lowerContext.includes('million') || lowerContext.includes('thousand')) {
    return generateCounterAnimation(outputPath, duration, width, height, 0, 1000000, '$');
  }

  if (lowerContext.includes('percent') || lowerContext.includes('%')) {
    return generateCounterAnimation(outputPath, duration, width, height, 0, 100, '');
  }

  // Default to pulse animation
  return generatePulseAnimation(outputPath, duration, width, height);
}
