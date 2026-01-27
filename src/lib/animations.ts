import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';

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
 * Run FFmpeg command directly using spawn for better compatibility
 * This avoids issues with lavfi input format not being available
 */
function runFFmpegCommand(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[Animation] Running: ffmpeg ${args.join(' ').substring(0, 200)}...`);

    const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });

    let stderr = '';
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        console.error(`[Animation] FFmpeg stderr: ${stderr.substring(stderr.length - 500)}`);
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
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

  // Create animated line graph using filter_complex with color source
  const lineColor = direction === 'up' ? '100:255:100' : '255:100:100';
  const bgColor = '15:15:35';

  const filterComplex = [
    `color=c=0x0f0f23:s=${width}x${height}:d=${duration}:r=${fps}`,
    `geq=r='if(between(Y,H-H*0.15-H*0.6*pow(X/W\\,0.7)*(N/${totalFrames})-8,H-H*0.15-H*0.6*pow(X/W\\,0.7)*(N/${totalFrames})+8),${direction === 'up' ? 100 : 255},15)':g='if(between(Y,H-H*0.15-H*0.6*pow(X/W\\,0.7)*(N/${totalFrames})-8,H-H*0.15-H*0.6*pow(X/W\\,0.7)*(N/${totalFrames})+8),${direction === 'up' ? 255 : 80},20)':b='if(between(Y,H-H*0.15-H*0.6*pow(X/W\\,0.7)*(N/${totalFrames})-8,H-H*0.15-H*0.6*pow(X/W\\,0.7)*(N/${totalFrames})+8),100,35)'`
  ].join(',');

  const args = [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=0x0f0f23:s=${width}x${height}:d=${duration}:r=${fps}`,
    '-vf', `geq=r='if(between(Y,H-H*0.15-H*0.6*pow(X/W\\,0.7)*(N/${totalFrames})-8,H-H*0.15-H*0.6*pow(X/W\\,0.7)*(N/${totalFrames})+8),${direction === 'up' ? 100 : 255},15)':g='if(between(Y,H-H*0.15-H*0.6*pow(X/W\\,0.7)*(N/${totalFrames})-8,H-H*0.15-H*0.6*pow(X/W\\,0.7)*(N/${totalFrames})+8),${direction === 'up' ? 255 : 80},20)':b='if(between(Y,H-H*0.15-H*0.6*pow(X/W\\,0.7)*(N/${totalFrames})-8,H-H*0.15-H*0.6*pow(X/W\\,0.7)*(N/${totalFrames})+8),100,35)'`,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '28',
    '-pix_fmt', 'yuv420p',
    '-t', String(duration),
    outputPath
  ];

  await runFFmpegCommand(args);
  console.log(`[Animation] Graph animation created: ${outputPath}`);
  return outputPath;
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
  const fontSize = Math.floor(height * 0.12);

  const args = [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=0x0f0f23:s=${width}x${height}:d=${duration}:r=${fps}`,
    '-vf', `drawtext=text='${prefix}%{eif\\:${startValue}+${endValue - startValue}*t/${duration}\\:d}':fontsize=${fontSize}:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2`,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '28',
    '-pix_fmt', 'yuv420p',
    '-t', String(duration),
    outputPath
  ];

  await runFFmpegCommand(args);
  console.log(`[Animation] Counter animation created: ${outputPath}`);
  return outputPath;
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

  // Parse color
  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);

  const args = [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=0x0f0f23:s=${width}x${height}:d=${duration}:r=${fps}`,
    '-vf', `geq=r='if(lt(sqrt(pow(X-${centerX}\\,2)+pow(Y-${centerY}\\,2))\\,${maxRadius}*(0.5+0.5*sin(2*PI*N/30)))\\,${r}\\,15)':g='if(lt(sqrt(pow(X-${centerX}\\,2)+pow(Y-${centerY}\\,2))\\,${maxRadius}*(0.5+0.5*sin(2*PI*N/30)))\\,${g}\\,20)':b='if(lt(sqrt(pow(X-${centerX}\\,2)+pow(Y-${centerY}\\,2))\\,${maxRadius}*(0.5+0.5*sin(2*PI*N/30)))\\,${b}\\,35)'`,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '28',
    '-pix_fmt', 'yuv420p',
    '-t', String(duration),
    outputPath
  ];

  await runFFmpegCommand(args);
  console.log(`[Animation] Pulse animation created: ${outputPath}`);
  return outputPath;
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

  const args = [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=0x0f0f23:s=${width}x${height}:d=${duration}:r=${fps}`,
    '-vf', `noise=alls=30:allf=t,geq=r='if(gt(lum(X\\,Y)\\,220)\\,255\\,15)':g='if(gt(lum(X\\,Y)\\,220)\\,255\\,20)':b='if(gt(lum(X\\,Y)\\,220)\\,200\\,35)'`,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '28',
    '-pix_fmt', 'yuv420p',
    '-t', String(duration),
    outputPath
  ];

  await runFFmpegCommand(args);
  console.log(`[Animation] Particle animation created: ${outputPath}`);
  return outputPath;
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
  color: string = '4F46E5'
): Promise<string> {
  console.log(`[Animation] Generating pie chart animation (${percentage}%)`);

  const fps = 30;
  const totalFrames = duration * fps;
  const centerX = width / 2;
  const centerY = height / 2;
  const outerRadius = Math.min(width, height) * 0.35;
  const innerRadius = outerRadius * 0.6;

  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);

  const args = [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=0x0f0f23:s=${width}x${height}:d=${duration}:r=${fps}`,
    '-vf', `geq=r='if(lt(sqrt(pow(X-${centerX}\\,2)+pow(Y-${centerY}\\,2))\\,${outerRadius})*gt(sqrt(pow(X-${centerX}\\,2)+pow(Y-${centerY}\\,2))\\,${innerRadius})*lt(mod(atan2(Y-${centerY}\\,X-${centerX})+PI\\,2*PI)\\,2*PI*${percentage / 100}*min(N/${totalFrames * 0.7}\\,1))\\,${r}\\,20)':g='if(lt(sqrt(pow(X-${centerX}\\,2)+pow(Y-${centerY}\\,2))\\,${outerRadius})*gt(sqrt(pow(X-${centerX}\\,2)+pow(Y-${centerY}\\,2))\\,${innerRadius})*lt(mod(atan2(Y-${centerY}\\,X-${centerX})+PI\\,2*PI)\\,2*PI*${percentage / 100}*min(N/${totalFrames * 0.7}\\,1))\\,${g}\\,25)':b='if(lt(sqrt(pow(X-${centerX}\\,2)+pow(Y-${centerY}\\,2))\\,${outerRadius})*gt(sqrt(pow(X-${centerX}\\,2)+pow(Y-${centerY}\\,2))\\,${innerRadius})*lt(mod(atan2(Y-${centerY}\\,X-${centerX})+PI\\,2*PI)\\,2*PI*${percentage / 100}*min(N/${totalFrames * 0.7}\\,1))\\,${b}\\,35)'`,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '28',
    '-pix_fmt', 'yuv420p',
    '-t', String(duration),
    outputPath
  ];

  await runFFmpegCommand(args);
  console.log(`[Animation] Pie chart animation created: ${outputPath}`);
  return outputPath;
}

/**
 * Generate animated bar chart with bars growing
 */
export async function generateBarChartAnimation(
  outputPath: string,
  duration: number,
  width: number,
  height: number,
  values: number[] = [40, 70, 55, 85, 60],
  color: string = '10B981'
): Promise<string> {
  console.log(`[Animation] Generating bar chart animation`);

  const fps = 30;
  const totalFrames = duration * fps;
  const numBars = values.length;
  const barWidth = Math.floor(width * 0.12);
  const gap = Math.floor((width - numBars * barWidth) / (numBars + 1));
  const maxBarHeight = height * 0.7;
  const baseY = height * 0.85;

  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);

  // Build expression for multiple bars
  let expr = '';
  for (let i = 0; i < numBars; i++) {
    const barX = gap + i * (barWidth + gap);
    const targetHeight = (values[i] / 100) * maxBarHeight;
    const delay = i * 0.08;

    if (i > 0) expr += '+';
    expr += `between(X\\,${barX}\\,${barX + barWidth})*between(Y\\,${baseY}-${targetHeight}*min(max((N/${totalFrames}-${delay})/0.4\\,0)\\,1)\\,${baseY})`;
  }

  const args = [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=0x0f0f23:s=${width}x${height}:d=${duration}:r=${fps}`,
    '-vf', `geq=r='if(${expr}\\,${r}\\,20)':g='if(${expr}\\,${g}\\,25)':b='if(${expr}\\,${b}\\,35)'`,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '28',
    '-pix_fmt', 'yuv420p',
    '-t', String(duration),
    outputPath
  ];

  await runFFmpegCommand(args);
  console.log(`[Animation] Bar chart animation created: ${outputPath}`);
  return outputPath;
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
  color: string = '3B82F6'
): Promise<string> {
  console.log(`[Animation] Generating progress bar animation`);

  const fps = 30;
  const totalFrames = duration * fps;
  const barWidth = width * 0.8;
  const barHeight = height * 0.12;
  const barX = (width - barWidth) / 2;
  const barY = (height - barHeight) / 2;

  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);

  const args = [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=0x0f0f23:s=${width}x${height}:d=${duration}:r=${fps}`,
    '-vf', `geq=r='if(between(X\\,${barX}\\,${barX + barWidth})*between(Y\\,${barY}\\,${barY + barHeight})\\,if(lt(X\\,${barX}+${barWidth * targetPercent / 100}*min(N/${totalFrames * 0.6}\\,1))\\,${r}\\,40)\\,20)':g='if(between(X\\,${barX}\\,${barX + barWidth})*between(Y\\,${barY}\\,${barY + barHeight})\\,if(lt(X\\,${barX}+${barWidth * targetPercent / 100}*min(N/${totalFrames * 0.6}\\,1))\\,${g}\\,45)\\,25)':b='if(between(X\\,${barX}\\,${barX + barWidth})*between(Y\\,${barY}\\,${barY + barHeight})\\,if(lt(X\\,${barX}+${barWidth * targetPercent / 100}*min(N/${totalFrames * 0.6}\\,1))\\,${b}\\,55)\\,35)'`,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '28',
    '-pix_fmt', 'yuv420p',
    '-t', String(duration),
    outputPath
  ];

  await runFFmpegCommand(args);
  console.log(`[Animation] Progress bar animation created: ${outputPath}`);
  return outputPath;
}

/**
 * Generate animated checkmark (success indicator)
 */
export async function generateCheckmarkAnimation(
  outputPath: string,
  duration: number,
  width: number,
  height: number,
  color: string = '22C55E'
): Promise<string> {
  console.log(`[Animation] Generating checkmark animation`);

  const fps = 30;
  const totalFrames = duration * fps;
  const centerX = width / 2;
  const centerY = height / 2;
  const size = Math.min(width, height) * 0.35;

  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);

  const args = [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=0x0f0f23:s=${width}x${height}:d=${duration}:r=${fps}`,
    '-vf', `geq=r='if(lt(sqrt(pow(X-${centerX}\\,2)+pow(Y-${centerY}\\,2))\\,${size}*min(N/${totalFrames * 0.3}\\,1))\\,${r}\\,20)':g='if(lt(sqrt(pow(X-${centerX}\\,2)+pow(Y-${centerY}\\,2))\\,${size}*min(N/${totalFrames * 0.3}\\,1))\\,${g}\\,25)':b='if(lt(sqrt(pow(X-${centerX}\\,2)+pow(Y-${centerY}\\,2))\\,${size}*min(N/${totalFrames * 0.3}\\,1))\\,${b}\\,35)',drawtext=text='✓':fontsize=${Math.floor(size * 1.2)}:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:alpha='if(gt(n\\,${Math.floor(totalFrames * 0.3)})\\,min((n-${Math.floor(totalFrames * 0.3)})/${Math.floor(totalFrames * 0.2)}\\,1)\\,0)'`,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '28',
    '-pix_fmt', 'yuv420p',
    '-t', String(duration),
    outputPath
  ];

  await runFFmpegCommand(args);
  console.log(`[Animation] Checkmark animation created: ${outputPath}`);
  return outputPath;
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
  colorA: string = 'EF4444',
  colorB: string = '22C55E'
): Promise<string> {
  console.log(`[Animation] Generating comparison animation (${valueA}% vs ${valueB}%)`);

  const fps = 30;
  const totalFrames = duration * fps;
  const barWidth = width * 0.35;
  const maxBarHeight = height * 0.6;
  const baseY = height * 0.8;
  const barAX = width * 0.15;
  const barBX = width * 0.5;

  const rA = parseInt(colorA.substring(0, 2), 16);
  const gA = parseInt(colorA.substring(2, 4), 16);
  const bA = parseInt(colorA.substring(4, 6), 16);
  const rB = parseInt(colorB.substring(0, 2), 16);
  const gB = parseInt(colorB.substring(2, 4), 16);
  const bB = parseInt(colorB.substring(4, 6), 16);

  const args = [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=0x0f0f23:s=${width}x${height}:d=${duration}:r=${fps}`,
    '-vf', `geq=r='if(between(X\\,${barAX}\\,${barAX + barWidth})*between(Y\\,${baseY}-${maxBarHeight * valueA / 100}*min(N/${totalFrames * 0.5}\\,1)\\,${baseY})\\,${rA}\\,if(between(X\\,${barBX}\\,${barBX + barWidth})*between(Y\\,${baseY}-${maxBarHeight * valueB / 100}*min(N/${totalFrames * 0.5}\\,1)\\,${baseY})\\,${rB}\\,20))':g='if(between(X\\,${barAX}\\,${barAX + barWidth})*between(Y\\,${baseY}-${maxBarHeight * valueA / 100}*min(N/${totalFrames * 0.5}\\,1)\\,${baseY})\\,${gA}\\,if(between(X\\,${barBX}\\,${barBX + barWidth})*between(Y\\,${baseY}-${maxBarHeight * valueB / 100}*min(N/${totalFrames * 0.5}\\,1)\\,${baseY})\\,${gB}\\,25))':b='if(between(X\\,${barAX}\\,${barAX + barWidth})*between(Y\\,${baseY}-${maxBarHeight * valueA / 100}*min(N/${totalFrames * 0.5}\\,1)\\,${baseY})\\,${bA}\\,if(between(X\\,${barBX}\\,${barBX + barWidth})*between(Y\\,${baseY}-${maxBarHeight * valueB / 100}*min(N/${totalFrames * 0.5}\\,1)\\,${baseY})\\,${bB}\\,35))'`,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '28',
    '-pix_fmt', 'yuv420p',
    '-t', String(duration),
    outputPath
  ];

  await runFFmpegCommand(args);
  console.log(`[Animation] Comparison animation created: ${outputPath}`);
  return outputPath;
}

/**
 * Generate spotlight/highlight animation
 */
export async function generateSpotlightAnimation(
  outputPath: string,
  duration: number,
  width: number,
  height: number,
  color: string = 'FBBF24'
): Promise<string> {
  console.log(`[Animation] Generating spotlight animation`);

  const fps = 30;
  const totalFrames = duration * fps;
  const centerX = width / 2;
  const centerY = height / 2;
  const maxRadius = Math.min(width, height) * 0.4;

  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);

  const args = [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=0x0f0f23:s=${width}x${height}:d=${duration}:r=${fps}`,
    '-vf', `geq=r='if(between(sqrt(pow(X-${centerX}\\,2)+pow(Y-${centerY}\\,2))\\,${maxRadius}*min(N/${totalFrames * 0.5}\\,1)*0.7\\,${maxRadius}*min(N/${totalFrames * 0.5}\\,1))\\,${r}\\,if(lt(sqrt(pow(X-${centerX}\\,2)+pow(Y-${centerY}\\,2))\\,${maxRadius}*min(N/${totalFrames * 0.5}\\,1)*0.7)\\,40\\,20))':g='if(between(sqrt(pow(X-${centerX}\\,2)+pow(Y-${centerY}\\,2))\\,${maxRadius}*min(N/${totalFrames * 0.5}\\,1)*0.7\\,${maxRadius}*min(N/${totalFrames * 0.5}\\,1))\\,${g}\\,if(lt(sqrt(pow(X-${centerX}\\,2)+pow(Y-${centerY}\\,2))\\,${maxRadius}*min(N/${totalFrames * 0.5}\\,1)*0.7)\\,45\\,25))':b='if(between(sqrt(pow(X-${centerX}\\,2)+pow(Y-${centerY}\\,2))\\,${maxRadius}*min(N/${totalFrames * 0.5}\\,1)*0.7\\,${maxRadius}*min(N/${totalFrames * 0.5}\\,1))\\,${b}\\,if(lt(sqrt(pow(X-${centerX}\\,2)+pow(Y-${centerY}\\,2))\\,${maxRadius}*min(N/${totalFrames * 0.5}\\,1)*0.7)\\,55\\,35))'`,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '28',
    '-pix_fmt', 'yuv420p',
    '-t', String(duration),
    outputPath
  ];

  await runFFmpegCommand(args);
  console.log(`[Animation] Spotlight animation created: ${outputPath}`);
  return outputPath;
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
  color: string = '22C55E'
): Promise<string> {
  console.log(`[Animation] Generating ${direction} arrow animation`);

  const fps = 30;
  const actualColor = direction === 'up' ? '22C55E' : 'EF4444';
  const centerX = width / 2;
  const centerY = height / 2;
  const arrowSize = Math.min(width, height) * 0.25;

  const r = parseInt(actualColor.substring(0, 2), 16);
  const g = parseInt(actualColor.substring(2, 4), 16);
  const b = parseInt(actualColor.substring(4, 6), 16);

  // Simplified arrow using a triangle
  const bounce = `${arrowSize * 0.08}*sin(2*PI*N/30)`;

  const args = [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=0x0f0f23:s=${width}x${height}:d=${duration}:r=${fps}`,
    '-vf', direction === 'up'
      ? `geq=r='if(lt(Y\\,${centerY}+${arrowSize * 0.4}-${bounce})*gt(Y\\,${centerY}-${arrowSize * 0.6}-${bounce})*lt(abs(X-${centerX})\\,(${centerY}+${arrowSize * 0.4}-Y)/${arrowSize}*${arrowSize * 0.5})\\,${r}\\,20)':g='if(lt(Y\\,${centerY}+${arrowSize * 0.4}-${bounce})*gt(Y\\,${centerY}-${arrowSize * 0.6}-${bounce})*lt(abs(X-${centerX})\\,(${centerY}+${arrowSize * 0.4}-Y)/${arrowSize}*${arrowSize * 0.5})\\,${g}\\,25)':b='if(lt(Y\\,${centerY}+${arrowSize * 0.4}-${bounce})*gt(Y\\,${centerY}-${arrowSize * 0.6}-${bounce})*lt(abs(X-${centerX})\\,(${centerY}+${arrowSize * 0.4}-Y)/${arrowSize}*${arrowSize * 0.5})\\,${b}\\,35)'`
      : `geq=r='if(gt(Y\\,${centerY}-${arrowSize * 0.4}+${bounce})*lt(Y\\,${centerY}+${arrowSize * 0.6}+${bounce})*lt(abs(X-${centerX})\\,(Y-${centerY}+${arrowSize * 0.4})/${arrowSize}*${arrowSize * 0.5})\\,${r}\\,20)':g='if(gt(Y\\,${centerY}-${arrowSize * 0.4}+${bounce})*lt(Y\\,${centerY}+${arrowSize * 0.6}+${bounce})*lt(abs(X-${centerX})\\,(Y-${centerY}+${arrowSize * 0.4})/${arrowSize}*${arrowSize * 0.5})\\,${g}\\,25)':b='if(gt(Y\\,${centerY}-${arrowSize * 0.4}+${bounce})*lt(Y\\,${centerY}+${arrowSize * 0.6}+${bounce})*lt(abs(X-${centerX})\\,(Y-${centerY}+${arrowSize * 0.4})/${arrowSize}*${arrowSize * 0.5})\\,${b}\\,35)'`,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '28',
    '-pix_fmt', 'yuv420p',
    '-t', String(duration),
    outputPath
  ];

  await runFFmpegCommand(args);
  console.log(`[Animation] Arrow animation created: ${outputPath}`);
  return outputPath;
}

/**
 * Generate animated clock/timer
 */
export async function generateClockAnimation(
  outputPath: string,
  duration: number,
  width: number,
  height: number,
  color: string = '8B5CF6'
): Promise<string> {
  console.log(`[Animation] Generating clock animation`);

  const fps = 30;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.3;

  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);

  const args = [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=0x0f0f23:s=${width}x${height}:d=${duration}:r=${fps}`,
    '-vf', `geq=r='if(between(sqrt(pow(X-${centerX}\\,2)+pow(Y-${centerY}\\,2))\\,${radius * 0.85}\\,${radius})\\,${r}\\,if(lt(sqrt(pow(X-${centerX}\\,2)+pow(Y-${centerY}\\,2))\\,${radius * 0.08})\\,255\\,20))':g='if(between(sqrt(pow(X-${centerX}\\,2)+pow(Y-${centerY}\\,2))\\,${radius * 0.85}\\,${radius})\\,${g}\\,if(lt(sqrt(pow(X-${centerX}\\,2)+pow(Y-${centerY}\\,2))\\,${radius * 0.08})\\,255\\,25))':b='if(between(sqrt(pow(X-${centerX}\\,2)+pow(Y-${centerY}\\,2))\\,${radius * 0.85}\\,${radius})\\,${b}\\,if(lt(sqrt(pow(X-${centerX}\\,2)+pow(Y-${centerY}\\,2))\\,${radius * 0.08})\\,255\\,35))'`,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '28',
    '-pix_fmt', 'yuv420p',
    '-t', String(duration),
    outputPath
  ];

  await runFFmpegCommand(args);
  console.log(`[Animation] Clock animation created: ${outputPath}`);
  return outputPath;
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
  color: string = '06B6D4'
): Promise<string> {
  console.log(`[Animation] Generating percentage ring animation (${percentage}%)`);

  const fps = 30;
  const totalFrames = duration * fps;
  const centerX = width / 2;
  const centerY = height / 2;
  const outerRadius = Math.min(width, height) * 0.35;
  const innerRadius = outerRadius * 0.7;

  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);

  const args = [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=0x0f0f23:s=${width}x${height}:d=${duration}:r=${fps}`,
    '-vf', `geq=r='if(between(sqrt(pow(X-${centerX}\\,2)+pow(Y-${centerY}\\,2))\\,${innerRadius}\\,${outerRadius})*lt(mod(atan2(${centerY}-Y\\,X-${centerX})+PI\\,2*PI)\\,2*PI*${percentage / 100}*min(N/${totalFrames * 0.6}\\,1))\\,${r}\\,if(between(sqrt(pow(X-${centerX}\\,2)+pow(Y-${centerY}\\,2))\\,${innerRadius}\\,${outerRadius})\\,40\\,20))':g='if(between(sqrt(pow(X-${centerX}\\,2)+pow(Y-${centerY}\\,2))\\,${innerRadius}\\,${outerRadius})*lt(mod(atan2(${centerY}-Y\\,X-${centerX})+PI\\,2*PI)\\,2*PI*${percentage / 100}*min(N/${totalFrames * 0.6}\\,1))\\,${g}\\,if(between(sqrt(pow(X-${centerX}\\,2)+pow(Y-${centerY}\\,2))\\,${innerRadius}\\,${outerRadius})\\,45\\,25))':b='if(between(sqrt(pow(X-${centerX}\\,2)+pow(Y-${centerY}\\,2))\\,${innerRadius}\\,${outerRadius})*lt(mod(atan2(${centerY}-Y\\,X-${centerX})+PI\\,2*PI)\\,2*PI*${percentage / 100}*min(N/${totalFrames * 0.6}\\,1))\\,${b}\\,if(between(sqrt(pow(X-${centerX}\\,2)+pow(Y-${centerY}\\,2))\\,${innerRadius}\\,${outerRadius})\\,55\\,35))'`,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '28',
    '-pix_fmt', 'yuv420p',
    '-t', String(duration),
    outputPath
  ];

  await runFFmpegCommand(args);
  console.log(`[Animation] Percentage ring animation created: ${outputPath}`);
  return outputPath;
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
  weight: number;
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
    if (bestAnimation === 'bar_chart') bestAnimation = 'progress_bar';
    if (bestAnimation === 'particles') bestAnimation = 'pulse';
  } else if (style === 'data-focused') {
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
