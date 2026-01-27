import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';

export type AnimationType =
  | 'graph_up'
  | 'graph_down'
  | 'counter'
  | 'pulse'
  | 'particles'
  | 'pie_chart'
  | 'bar_chart'
  | 'progress_bar'
  | 'checkmark'
  | 'comparison'
  | 'spotlight'
  | 'arrow_up'
  | 'arrow_down'
  | 'clock'
  | 'percentage_ring';

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
 * Generate animated pie chart filling up
 */
export async function generatePieChartAnimation(
  outputPath: string,
  duration: number,
  width: number,
  height: number,
  percentage: number = 75,
  color: string = '4F46E5' // Indigo
): Promise<string> {
  console.log(`[Animation] Generating pie chart animation (${percentage}%)`);

  const fps = 30;
  const totalFrames = duration * fps;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.35;

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(`color=c=0x0f0f23:s=${width}x${height}:d=${duration}`)
      .inputFormat('lavfi')
      .complexFilter([
        // Draw animated pie segment using geq
        // We simulate a pie chart by drawing pixels in a circular sector
        `geq=r='if(lt(sqrt(pow(X-${centerX},2)+pow(Y-${centerY},2)),${radius})*gt(sqrt(pow(X-${centerX},2)+pow(Y-${centerY},2)),${radius * 0.6})*lt(mod(atan2(Y-${centerY},X-${centerX})+PI,2*PI),2*PI*${percentage / 100}*min(N/${totalFrames * 0.7},1)),0x${color.substring(0, 2)},20)':g='if(lt(sqrt(pow(X-${centerX},2)+pow(Y-${centerY},2)),${radius})*gt(sqrt(pow(X-${centerX},2)+pow(Y-${centerY},2)),${radius * 0.6})*lt(mod(atan2(Y-${centerY},X-${centerX})+PI,2*PI),2*PI*${percentage / 100}*min(N/${totalFrames * 0.7},1)),0x${color.substring(2, 4)},25)':b='if(lt(sqrt(pow(X-${centerX},2)+pow(Y-${centerY},2)),${radius})*gt(sqrt(pow(X-${centerX},2)+pow(Y-${centerY},2)),${radius * 0.6})*lt(mod(atan2(Y-${centerY},X-${centerX})+PI,2*PI),2*PI*${percentage / 100}*min(N/${totalFrames * 0.7},1)),0x${color.substring(4, 6)},35)'[out]`
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
        console.log(`[Animation] Pie chart animation created: ${outputPath}`);
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
 * Generate animated bar chart with bars growing
 */
export async function generateBarChartAnimation(
  outputPath: string,
  duration: number,
  width: number,
  height: number,
  values: number[] = [40, 70, 55, 85, 60], // Relative heights (0-100)
  color: string = '10B981' // Emerald green
): Promise<string> {
  console.log(`[Animation] Generating bar chart animation`);

  const fps = 30;
  const totalFrames = duration * fps;
  const numBars = values.length;
  const barWidth = Math.floor(width * 0.12);
  const gap = Math.floor((width - numBars * barWidth) / (numBars + 1));
  const maxBarHeight = height * 0.7;
  const baseY = height * 0.85;

  // Build geq expression for multiple bars
  let rExpr = '20';
  let gExpr = '25';
  let bExpr = '35';

  for (let i = 0; i < numBars; i++) {
    const barX = gap + i * (barWidth + gap);
    const targetHeight = (values[i] / 100) * maxBarHeight;
    // Each bar grows with a slight delay
    const delay = i * 0.1;
    const growProgress = `min(max((N/${totalFrames}-${delay})/${0.5 - delay},0),1)`;
    const currentHeight = `${targetHeight}*${growProgress}`;

    // Add this bar to the expression
    rExpr = `if(between(X,${barX},${barX + barWidth})*between(Y,${baseY}-${currentHeight},${baseY}),0x${color.substring(0, 2)},${rExpr})`;
    gExpr = `if(between(X,${barX},${barX + barWidth})*between(Y,${baseY}-${currentHeight},${baseY}),0x${color.substring(2, 4)},${gExpr})`;
    bExpr = `if(between(X,${barX},${barX + barWidth})*between(Y,${baseY}-${currentHeight},${baseY}),0x${color.substring(4, 6)},${bExpr})`;
  }

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(`color=c=0x0f0f23:s=${width}x${height}:d=${duration}`)
      .inputFormat('lavfi')
      .complexFilter([
        `geq=r='${rExpr}':g='${gExpr}':b='${bExpr}'[out]`
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
        console.log(`[Animation] Bar chart animation created: ${outputPath}`);
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
 * Generate animated progress bar
 */
export async function generateProgressBarAnimation(
  outputPath: string,
  duration: number,
  width: number,
  height: number,
  targetPercent: number = 85,
  color: string = '3B82F6' // Blue
): Promise<string> {
  console.log(`[Animation] Generating progress bar animation`);

  const fps = 30;
  const totalFrames = duration * fps;
  const barWidth = width * 0.8;
  const barHeight = height * 0.12;
  const barX = (width - barWidth) / 2;
  const barY = (height - barHeight) / 2;
  const borderRadius = barHeight / 2;

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(`color=c=0x0f0f23:s=${width}x${height}:d=${duration}`)
      .inputFormat('lavfi')
      .complexFilter([
        // Draw progress bar background and animated fill
        `geq=r='if(between(X,${barX},${barX + barWidth})*between(Y,${barY},${barY + barHeight}),if(lt(X,${barX}+${barWidth * targetPercent / 100}*min(N/${totalFrames * 0.6},1)),0x${color.substring(0, 2)},40),20)':g='if(between(X,${barX},${barX + barWidth})*between(Y,${barY},${barY + barHeight}),if(lt(X,${barX}+${barWidth * targetPercent / 100}*min(N/${totalFrames * 0.6},1)),0x${color.substring(2, 4)},45),25)':b='if(between(X,${barX},${barX + barWidth})*between(Y,${barY},${barY + barHeight}),if(lt(X,${barX}+${barWidth * targetPercent / 100}*min(N/${totalFrames * 0.6},1)),0x${color.substring(4, 6)},55),35)'[out]`
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
        console.log(`[Animation] Progress bar animation created: ${outputPath}`);
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
 * Generate animated checkmark (success indicator)
 */
export async function generateCheckmarkAnimation(
  outputPath: string,
  duration: number,
  width: number,
  height: number,
  color: string = '22C55E' // Green
): Promise<string> {
  console.log(`[Animation] Generating checkmark animation`);

  const fps = 30;
  const totalFrames = duration * fps;
  const centerX = width / 2;
  const centerY = height / 2;
  const size = Math.min(width, height) * 0.35;

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(`color=c=0x0f0f23:s=${width}x${height}:d=${duration}`)
      .inputFormat('lavfi')
      .complexFilter([
        // Draw circle background that scales in, then checkmark that draws
        `geq=r='if(lt(sqrt(pow(X-${centerX},2)+pow(Y-${centerY},2)),${size}*min(N/${totalFrames * 0.3},1)),0x${color.substring(0, 2)},20)':g='if(lt(sqrt(pow(X-${centerX},2)+pow(Y-${centerY},2)),${size}*min(N/${totalFrames * 0.3},1)),0x${color.substring(2, 4)},25)':b='if(lt(sqrt(pow(X-${centerX},2)+pow(Y-${centerY},2)),${size}*min(N/${totalFrames * 0.3},1)),0x${color.substring(4, 6)},35)'[circle]`,
        // Overlay white checkmark shape using drawtext with unicode
        `[circle]drawtext=text='✓':fontsize=${Math.floor(size * 1.2)}:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:alpha='if(gt(N,${totalFrames * 0.3}),min((N-${totalFrames * 0.3})/${totalFrames * 0.2},1),0)'[out]`
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
        console.log(`[Animation] Checkmark animation created: ${outputPath}`);
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
 * Generate comparison animation (A vs B bars)
 */
export async function generateComparisonAnimation(
  outputPath: string,
  duration: number,
  width: number,
  height: number,
  valueA: number = 35,
  valueB: number = 80,
  colorA: string = 'EF4444', // Red
  colorB: string = '22C55E'  // Green
): Promise<string> {
  console.log(`[Animation] Generating comparison animation (${valueA}% vs ${valueB}%)`);

  const fps = 30;
  const totalFrames = duration * fps;
  const barWidth = width * 0.35;
  const maxBarHeight = height * 0.6;
  const baseY = height * 0.8;
  const barAX = width * 0.15;
  const barBX = width * 0.5;

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(`color=c=0x0f0f23:s=${width}x${height}:d=${duration}`)
      .inputFormat('lavfi')
      .complexFilter([
        // Draw two comparison bars with labels
        `geq=r='if(between(X,${barAX},${barAX + barWidth})*between(Y,${baseY}-${maxBarHeight * valueA / 100}*min(N/${totalFrames * 0.5},1),${baseY}),0x${colorA.substring(0, 2)},if(between(X,${barBX},${barBX + barWidth})*between(Y,${baseY}-${maxBarHeight * valueB / 100}*min(N/${totalFrames * 0.5},1),${baseY}),0x${colorB.substring(0, 2)},20))':g='if(between(X,${barAX},${barAX + barWidth})*between(Y,${baseY}-${maxBarHeight * valueA / 100}*min(N/${totalFrames * 0.5},1),${baseY}),0x${colorA.substring(2, 4)},if(between(X,${barBX},${barBX + barWidth})*between(Y,${baseY}-${maxBarHeight * valueB / 100}*min(N/${totalFrames * 0.5},1),${baseY}),0x${colorB.substring(2, 4)},25))':b='if(between(X,${barAX},${barAX + barWidth})*between(Y,${baseY}-${maxBarHeight * valueA / 100}*min(N/${totalFrames * 0.5},1),${baseY}),0x${colorA.substring(4, 6)},if(between(X,${barBX},${barBX + barWidth})*between(Y,${baseY}-${maxBarHeight * valueB / 100}*min(N/${totalFrames * 0.5},1),${baseY}),0x${colorB.substring(4, 6)},35))'[out]`
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
        console.log(`[Animation] Comparison animation created: ${outputPath}`);
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
 * Generate spotlight/highlight animation
 */
export async function generateSpotlightAnimation(
  outputPath: string,
  duration: number,
  width: number,
  height: number,
  color: string = 'FBBF24' // Amber/Yellow
): Promise<string> {
  console.log(`[Animation] Generating spotlight animation`);

  const fps = 30;
  const totalFrames = duration * fps;
  const centerX = width / 2;
  const centerY = height / 2;
  const maxRadius = Math.min(width, height) * 0.4;

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(`color=c=0x0f0f23:s=${width}x${height}:d=${duration}`)
      .inputFormat('lavfi')
      .complexFilter([
        // Create expanding ring effect with glow
        `geq=r='if(between(sqrt(pow(X-${centerX},2)+pow(Y-${centerY},2)),${maxRadius}*min(N/${totalFrames * 0.5},1)*0.8,${maxRadius}*min(N/${totalFrames * 0.5},1)),0x${color.substring(0, 2)},if(lt(sqrt(pow(X-${centerX},2)+pow(Y-${centerY},2)),${maxRadius}*min(N/${totalFrames * 0.5},1)*0.8),40,20))':g='if(between(sqrt(pow(X-${centerX},2)+pow(Y-${centerY},2)),${maxRadius}*min(N/${totalFrames * 0.5},1)*0.8,${maxRadius}*min(N/${totalFrames * 0.5},1)),0x${color.substring(2, 4)},if(lt(sqrt(pow(X-${centerX},2)+pow(Y-${centerY},2)),${maxRadius}*min(N/${totalFrames * 0.5},1)*0.8),45,25))':b='if(between(sqrt(pow(X-${centerX},2)+pow(Y-${centerY},2)),${maxRadius}*min(N/${totalFrames * 0.5},1)*0.8,${maxRadius}*min(N/${totalFrames * 0.5},1)),0x${color.substring(4, 6)},if(lt(sqrt(pow(X-${centerX},2)+pow(Y-${centerY},2)),${maxRadius}*min(N/${totalFrames * 0.5},1)*0.8),55,35))'[out]`
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
        console.log(`[Animation] Spotlight animation created: ${outputPath}`);
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
 * Generate animated arrow (direction indicator)
 */
export async function generateArrowAnimation(
  outputPath: string,
  duration: number,
  width: number,
  height: number,
  direction: 'up' | 'down' = 'up',
  color: string = '22C55E' // Green for up, will be overridden for down
): Promise<string> {
  console.log(`[Animation] Generating ${direction} arrow animation`);

  const fps = 30;
  const totalFrames = duration * fps;
  const actualColor = direction === 'up' ? '22C55E' : 'EF4444';
  const centerX = width / 2;
  const centerY = height / 2;
  const arrowHeight = height * 0.4;
  const arrowWidth = width * 0.25;

  // Arrow triangle points
  const tipY = direction === 'up' ? centerY - arrowHeight / 2 : centerY + arrowHeight / 2;
  const baseY = direction === 'up' ? centerY + arrowHeight / 4 : centerY - arrowHeight / 4;

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(`color=c=0x0f0f23:s=${width}x${height}:d=${duration}`)
      .inputFormat('lavfi')
      .complexFilter([
        // Draw arrow triangle with bounce animation
        direction === 'up'
          ? `geq=r='if(lt(Y,${centerY}+${arrowHeight / 4}-${arrowHeight * 0.1}*sin(2*PI*N/30))*gt(Y,${centerY}-${arrowHeight / 2}-${arrowHeight * 0.1}*sin(2*PI*N/30))*lt(abs(X-${centerX}),(${centerY}+${arrowHeight / 4}-Y)/${arrowHeight * 0.75}*${arrowWidth / 2}),0x${actualColor.substring(0, 2)},20)':g='if(lt(Y,${centerY}+${arrowHeight / 4}-${arrowHeight * 0.1}*sin(2*PI*N/30))*gt(Y,${centerY}-${arrowHeight / 2}-${arrowHeight * 0.1}*sin(2*PI*N/30))*lt(abs(X-${centerX}),(${centerY}+${arrowHeight / 4}-Y)/${arrowHeight * 0.75}*${arrowWidth / 2}),0x${actualColor.substring(2, 4)},25)':b='if(lt(Y,${centerY}+${arrowHeight / 4}-${arrowHeight * 0.1}*sin(2*PI*N/30))*gt(Y,${centerY}-${arrowHeight / 2}-${arrowHeight * 0.1}*sin(2*PI*N/30))*lt(abs(X-${centerX}),(${centerY}+${arrowHeight / 4}-Y)/${arrowHeight * 0.75}*${arrowWidth / 2}),0x${actualColor.substring(4, 6)},35)'[out]`
          : `geq=r='if(gt(Y,${centerY}-${arrowHeight / 4}+${arrowHeight * 0.1}*sin(2*PI*N/30))*lt(Y,${centerY}+${arrowHeight / 2}+${arrowHeight * 0.1}*sin(2*PI*N/30))*lt(abs(X-${centerX}),(Y-${centerY}+${arrowHeight / 4})/${arrowHeight * 0.75}*${arrowWidth / 2}),0x${actualColor.substring(0, 2)},20)':g='if(gt(Y,${centerY}-${arrowHeight / 4}+${arrowHeight * 0.1}*sin(2*PI*N/30))*lt(Y,${centerY}+${arrowHeight / 2}+${arrowHeight * 0.1}*sin(2*PI*N/30))*lt(abs(X-${centerX}),(Y-${centerY}+${arrowHeight / 4})/${arrowHeight * 0.75}*${arrowWidth / 2}),0x${actualColor.substring(2, 4)},25)':b='if(gt(Y,${centerY}-${arrowHeight / 4}+${arrowHeight * 0.1}*sin(2*PI*N/30))*lt(Y,${centerY}+${arrowHeight / 2}+${arrowHeight * 0.1}*sin(2*PI*N/30))*lt(abs(X-${centerX}),(Y-${centerY}+${arrowHeight / 4})/${arrowHeight * 0.75}*${arrowWidth / 2}),0x${actualColor.substring(4, 6)},35)'[out]`
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
        console.log(`[Animation] Arrow animation created: ${outputPath}`);
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
 * Generate animated clock/timer
 */
export async function generateClockAnimation(
  outputPath: string,
  duration: number,
  width: number,
  height: number,
  color: string = '8B5CF6' // Purple
): Promise<string> {
  console.log(`[Animation] Generating clock animation`);

  const fps = 30;
  const totalFrames = duration * fps;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.3;

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(`color=c=0x0f0f23:s=${width}x${height}:d=${duration}`)
      .inputFormat('lavfi')
      .complexFilter([
        // Draw clock face ring
        `geq=r='if(between(sqrt(pow(X-${centerX},2)+pow(Y-${centerY},2)),${radius * 0.85},${radius}),0x${color.substring(0, 2)},20)':g='if(between(sqrt(pow(X-${centerX},2)+pow(Y-${centerY},2)),${radius * 0.85},${radius}),0x${color.substring(2, 4)},25)':b='if(between(sqrt(pow(X-${centerX},2)+pow(Y-${centerY},2)),${radius * 0.85},${radius}),0x${color.substring(4, 6)},35)'[clock]`,
        // Add center dot
        `[clock]geq=r='if(lt(sqrt(pow(X-${centerX},2)+pow(Y-${centerY},2)),${radius * 0.08}),255,p(X,Y))':g='if(lt(sqrt(pow(X-${centerX},2)+pow(Y-${centerY},2)),${radius * 0.08}),255,p(X,Y))':b='if(lt(sqrt(pow(X-${centerX},2)+pow(Y-${centerY},2)),${radius * 0.08}),255,p(X,Y))'[out]`
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
        console.log(`[Animation] Clock animation created: ${outputPath}`);
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
 * Generate animated percentage ring
 */
export async function generatePercentageRingAnimation(
  outputPath: string,
  duration: number,
  width: number,
  height: number,
  percentage: number = 75,
  color: string = '06B6D4' // Cyan
): Promise<string> {
  console.log(`[Animation] Generating percentage ring animation (${percentage}%)`);

  const fps = 30;
  const totalFrames = duration * fps;
  const centerX = width / 2;
  const centerY = height / 2;
  const outerRadius = Math.min(width, height) * 0.35;
  const innerRadius = outerRadius * 0.7;

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(`color=c=0x0f0f23:s=${width}x${height}:d=${duration}`)
      .inputFormat('lavfi')
      .complexFilter([
        // Draw animated ring that fills based on percentage
        `geq=r='if(between(sqrt(pow(X-${centerX},2)+pow(Y-${centerY},2)),${innerRadius},${outerRadius})*lt(mod(atan2(${centerY}-Y,X-${centerX})+PI,2*PI),2*PI*${percentage / 100}*min(N/${totalFrames * 0.6},1)),0x${color.substring(0, 2)},if(between(sqrt(pow(X-${centerX},2)+pow(Y-${centerY},2)),${innerRadius},${outerRadius}),40,20))':g='if(between(sqrt(pow(X-${centerX},2)+pow(Y-${centerY},2)),${innerRadius},${outerRadius})*lt(mod(atan2(${centerY}-Y,X-${centerX})+PI,2*PI),2*PI*${percentage / 100}*min(N/${totalFrames * 0.6},1)),0x${color.substring(2, 4)},if(between(sqrt(pow(X-${centerX},2)+pow(Y-${centerY},2)),${innerRadius},${outerRadius}),45,25))':b='if(between(sqrt(pow(X-${centerX},2)+pow(Y-${centerY},2)),${innerRadius},${outerRadius})*lt(mod(atan2(${centerY}-Y,X-${centerX})+PI,2*PI),2*PI*${percentage / 100}*min(N/${totalFrames * 0.6},1)),0x${color.substring(4, 6)},if(between(sqrt(pow(X-${centerX},2)+pow(Y-${centerY},2)),${innerRadius},${outerRadius}),55,35))'[out]`
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
        console.log(`[Animation] Percentage ring animation created: ${outputPath}`);
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
 * B-Roll animation style presets
 */
export type BRollStyle = 'minimal' | 'dynamic' | 'data-focused';

export interface BRollConfig {
  style: BRollStyle;
  intensity: 'low' | 'medium' | 'high';
  maxMoments: number;
}

export const DEFAULT_BROLL_CONFIG: BRollConfig = {
  style: 'dynamic',
  intensity: 'medium',
  maxMoments: 3,
};

/**
 * Keyword patterns for matching context to animation types
 */
const ANIMATION_PATTERNS: Array<{
  keywords: string[];
  animation: AnimationType;
  weight: number; // Higher weight = higher priority when multiple matches
}> = [
  // Growth & Positive trends
  { keywords: ['growth', 'increase', 'rise', 'rising', 'profit', 'success', 'gains', 'improved', 'boost', 'surge', 'skyrocket'], animation: 'graph_up', weight: 10 },
  { keywords: ['arrow up', 'trending up', 'going up', 'higher'], animation: 'arrow_up', weight: 8 },

  // Decline & Negative trends
  { keywords: ['crash', 'fall', 'decline', 'loss', 'drop', 'plummet', 'decrease', 'failing', 'worse'], animation: 'graph_down', weight: 10 },
  { keywords: ['arrow down', 'trending down', 'going down', 'lower'], animation: 'arrow_down', weight: 8 },

  // Money & Finance
  { keywords: ['money', 'dollar', 'revenue', 'income', 'million', 'billion', 'thousand', 'salary', 'earnings', 'price', 'cost', 'budget', 'investment', 'profit margin'], animation: 'counter', weight: 9 },

  // Percentages & Statistics
  { keywords: ['percent', '%', 'percentage', 'ratio', 'rate', 'conversion'], animation: 'percentage_ring', weight: 9 },
  { keywords: ['majority', 'most people', 'portion', 'share', 'distribution', 'breakdown'], animation: 'pie_chart', weight: 8 },

  // Comparisons
  { keywords: ['compare', 'versus', 'vs', 'better than', 'worse than', 'difference', 'before and after', 'old vs new'], animation: 'comparison', weight: 10 },

  // Data & Analytics
  { keywords: ['data', 'statistics', 'analytics', 'metrics', 'numbers', 'results', 'findings', 'research'], animation: 'bar_chart', weight: 7 },
  { keywords: ['chart', 'graph', 'visualization'], animation: 'bar_chart', weight: 6 },

  // Progress & Loading
  { keywords: ['progress', 'loading', 'completion', 'done', 'finished', 'complete', 'achieving', 'goal', 'target'], animation: 'progress_bar', weight: 8 },

  // Success & Confirmation
  { keywords: ['success', 'correct', 'right', 'approved', 'confirmed', 'verified', 'achieved', 'won', 'winner', 'completed', 'done', 'checked'], animation: 'checkmark', weight: 9 },

  // Time & Duration
  { keywords: ['time', 'hours', 'minutes', 'seconds', 'duration', 'wait', 'schedule', 'deadline', 'timing', 'clock', 'timer'], animation: 'clock', weight: 8 },

  // Attention & Highlight
  { keywords: ['important', 'key', 'crucial', 'highlight', 'attention', 'focus', 'notice', 'remember', 'critical', 'essential', 'main point'], animation: 'spotlight', weight: 7 },

  // Default/Emphasis
  { keywords: ['amazing', 'incredible', 'wow', 'shocking', 'surprising', 'exciting'], animation: 'pulse', weight: 5 },
  { keywords: ['celebration', 'celebrate', 'congrats', 'congratulations', 'party'], animation: 'particles', weight: 6 },
];

/**
 * Generate animation based on context from transcript
 * Uses intelligent keyword matching to select the most appropriate animation
 */
export async function generateContextualAnimation(
  outputPath: string,
  duration: number,
  width: number,
  height: number,
  context: string,
  style: BRollStyle = 'dynamic'
): Promise<string> {
  const lowerContext = context.toLowerCase();

  // Score each animation type based on keyword matches
  const scores: Map<AnimationType, number> = new Map();

  for (const pattern of ANIMATION_PATTERNS) {
    for (const keyword of pattern.keywords) {
      if (lowerContext.includes(keyword)) {
        const currentScore = scores.get(pattern.animation) || 0;
        scores.set(pattern.animation, currentScore + pattern.weight);
      }
    }
  }

  // Find the animation with the highest score
  let bestAnimation: AnimationType = 'pulse'; // Default
  let highestScore = 0;

  for (const [animation, score] of scores) {
    if (score > highestScore) {
      highestScore = score;
      bestAnimation = animation;
    }
  }

  console.log(`[Animation] Context: "${context.substring(0, 50)}..." -> ${bestAnimation} (score: ${highestScore})`);

  // Apply style preferences
  if (style === 'minimal') {
    // Prefer simpler animations for minimal style
    if (bestAnimation === 'bar_chart') bestAnimation = 'progress_bar';
    if (bestAnimation === 'particles') bestAnimation = 'pulse';
  } else if (style === 'data-focused') {
    // Prefer data visualizations
    if (bestAnimation === 'pulse') bestAnimation = 'bar_chart';
    if (bestAnimation === 'spotlight') bestAnimation = 'percentage_ring';
  }

  // Generate the selected animation
  switch (bestAnimation) {
    case 'graph_up':
      return generateGraphAnimation(outputPath, duration, width, height, 'up');
    case 'graph_down':
      return generateGraphAnimation(outputPath, duration, width, height, 'down');
    case 'counter':
      return generateCounterAnimation(outputPath, duration, width, height, 0, 1000000, '$');
    case 'pie_chart':
      return generatePieChartAnimation(outputPath, duration, width, height, 75);
    case 'bar_chart':
      return generateBarChartAnimation(outputPath, duration, width, height);
    case 'progress_bar':
      return generateProgressBarAnimation(outputPath, duration, width, height, 85);
    case 'checkmark':
      return generateCheckmarkAnimation(outputPath, duration, width, height);
    case 'comparison':
      return generateComparisonAnimation(outputPath, duration, width, height);
    case 'spotlight':
      return generateSpotlightAnimation(outputPath, duration, width, height);
    case 'arrow_up':
      return generateArrowAnimation(outputPath, duration, width, height, 'up');
    case 'arrow_down':
      return generateArrowAnimation(outputPath, duration, width, height, 'down');
    case 'clock':
      return generateClockAnimation(outputPath, duration, width, height);
    case 'percentage_ring':
      return generatePercentageRingAnimation(outputPath, duration, width, height, 75);
    case 'particles':
      return generateParticleAnimation(outputPath, duration, width, height);
    case 'pulse':
    default:
      return generatePulseAnimation(outputPath, duration, width, height);
  }
}
