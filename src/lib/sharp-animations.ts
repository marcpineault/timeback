import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { logger } from './logger';

export type AnimationType =
  | 'graph_up'
  | 'graph_down'
  | 'counter'
  | 'pie_chart'
  | 'bar_chart'
  | 'progress_bar'
  | 'checkmark'
  | 'comparison'
  | 'percentage_ring'
  | 'pulse'
  | 'highlight';

interface AnimationFrameOptions {
  width: number;
  height: number;
  frame: number;
  totalFrames: number;
  data?: Record<string, unknown>;
}

/**
 * Run FFmpeg command to stitch frames into video
 */
async function framesToVideo(
  framesDir: string,
  outputPath: string,
  fps: number = 30
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-framerate', String(fps),
      '-i', path.join(framesDir, 'frame_%04d.png'),
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      outputPath
    ];

    const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr?.on('data', (data) => { stderr += data.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`));
    });
    proc.on('error', reject);
  });
}

/**
 * Create an SVG for a specific animation frame
 */
function createAnimationSVG(type: AnimationType, opts: AnimationFrameOptions): string {
  const { width, height, frame, totalFrames, data = {} } = opts;
  const progress = frame / totalFrames;
  const easeOut = 1 - Math.pow(1 - Math.min(progress * 1.5, 1), 3); // Ease-out cubic

  // Dark background
  const bgColor = '#0f0f23';

  switch (type) {
    case 'graph_up': {
      const lineProgress = easeOut;
      const points: string[] = [];
      const graphWidth = width * 0.7;
      const graphHeight = height * 0.5;
      const startX = width * 0.15;
      const startY = height * 0.75;

      // Generate line points with upward curve
      for (let i = 0; i <= 20; i++) {
        const x = startX + (graphWidth * (i / 20)) * lineProgress;
        const yProgress = Math.pow(i / 20, 0.7); // Curved growth
        const y = startY - (graphHeight * yProgress * lineProgress);
        points.push(`${x},${y}`);
      }

      // Gradient fill area
      const areaPoints = [...points, `${startX + graphWidth * lineProgress},${startY}`, `${startX},${startY}`].join(' ');

      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <rect width="100%" height="100%" fill="${bgColor}"/>
        <defs>
          <linearGradient id="greenGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:#22C55E;stop-opacity:0.6"/>
            <stop offset="100%" style="stop-color:#22C55E;stop-opacity:0"/>
          </linearGradient>
        </defs>
        <polygon points="${areaPoints}" fill="url(#greenGrad)"/>
        <polyline points="${points.join(' ')}" fill="none" stroke="#22C55E" stroke-width="4" stroke-linecap="round"/>
        <circle cx="${points[points.length-1].split(',')[0]}" cy="${points[points.length-1].split(',')[1]}" r="8" fill="#22C55E"/>
        <text x="${width/2}" y="${height * 0.18}" text-anchor="middle" fill="#22C55E" font-size="${height * 0.08}" font-family="Arial, sans-serif" font-weight="bold">GROWTH</text>
      </svg>`;
    }

    case 'graph_down': {
      const lineProgress = easeOut;
      const points: string[] = [];
      const graphWidth = width * 0.7;
      const graphHeight = height * 0.5;
      const startX = width * 0.15;
      const startY = height * 0.25;

      for (let i = 0; i <= 20; i++) {
        const x = startX + (graphWidth * (i / 20)) * lineProgress;
        const yProgress = Math.pow(i / 20, 0.7);
        const y = startY + (graphHeight * yProgress * lineProgress);
        points.push(`${x},${y}`);
      }

      const areaPoints = [...points, `${startX + graphWidth * lineProgress},${startY}`, `${startX},${startY}`].join(' ');

      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <rect width="100%" height="100%" fill="${bgColor}"/>
        <defs>
          <linearGradient id="redGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:#EF4444;stop-opacity:0"/>
            <stop offset="100%" style="stop-color:#EF4444;stop-opacity:0.6"/>
          </linearGradient>
        </defs>
        <polygon points="${areaPoints}" fill="url(#redGrad)"/>
        <polyline points="${points.join(' ')}" fill="none" stroke="#EF4444" stroke-width="4" stroke-linecap="round"/>
        <circle cx="${points[points.length-1].split(',')[0]}" cy="${points[points.length-1].split(',')[1]}" r="8" fill="#EF4444"/>
        <text x="${width/2}" y="${height * 0.9}" text-anchor="middle" fill="#EF4444" font-size="${height * 0.08}" font-family="Arial, sans-serif" font-weight="bold">DECLINE</text>
      </svg>`;
    }

    case 'counter': {
      const targetValue = (data.value as number) || 1000000;
      const prefix = (data.prefix as string) || '$';
      const currentValue = Math.floor(targetValue * easeOut);
      const formatted = currentValue.toLocaleString();

      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <rect width="100%" height="100%" fill="${bgColor}"/>
        <text x="${width/2}" y="${height * 0.45}" text-anchor="middle" fill="#22C55E" font-size="${height * 0.18}" font-family="Arial, sans-serif" font-weight="bold">${prefix}${formatted}</text>
        <text x="${width/2}" y="${height * 0.65}" text-anchor="middle" fill="#888" font-size="${height * 0.06}" font-family="Arial, sans-serif">REVENUE</text>
      </svg>`;
    }

    case 'pie_chart': {
      const percentage = (data.percentage as number) || 75;
      const currentPct = percentage * easeOut;
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) * 0.32;
      const innerRadius = radius * 0.6;

      // Calculate arc
      const angle = (currentPct / 100) * 2 * Math.PI - Math.PI / 2;
      const startAngle = -Math.PI / 2;
      const largeArc = currentPct > 50 ? 1 : 0;

      const outerX = centerX + radius * Math.cos(angle);
      const outerY = centerY + radius * Math.sin(angle);
      const innerX = centerX + innerRadius * Math.cos(angle);
      const innerY = centerY + innerRadius * Math.sin(angle);

      const arcPath = currentPct > 0 ? `
        M ${centerX} ${centerY - radius}
        A ${radius} ${radius} 0 ${largeArc} 1 ${outerX} ${outerY}
        L ${innerX} ${innerY}
        A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${centerX} ${centerY - innerRadius}
        Z
      ` : '';

      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <rect width="100%" height="100%" fill="${bgColor}"/>
        <circle cx="${centerX}" cy="${centerY}" r="${radius}" fill="none" stroke="#333" stroke-width="${radius - innerRadius}"/>
        <path d="${arcPath}" fill="#4F46E5"/>
        <text x="${centerX}" y="${centerY + height * 0.02}" text-anchor="middle" fill="white" font-size="${height * 0.12}" font-family="Arial, sans-serif" font-weight="bold">${Math.round(currentPct)}%</text>
      </svg>`;
    }

    case 'bar_chart': {
      const values = (data.values as number[]) || [40, 70, 55, 85, 60];
      const colors = ['#3B82F6', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6'];
      const barWidth = (width * 0.7) / values.length - 10;
      const maxHeight = height * 0.6;
      const startX = width * 0.15;
      const baseY = height * 0.85;

      let bars = '';
      values.forEach((val, i) => {
        const barHeight = (val / 100) * maxHeight * easeOut;
        const x = startX + i * (barWidth + 10);
        const y = baseY - barHeight;
        const delay = i * 0.1;
        const adjustedProgress = Math.max(0, Math.min(1, (progress - delay) * 2));
        const adjustedHeight = (val / 100) * maxHeight * (1 - Math.pow(1 - adjustedProgress, 3));

        bars += `<rect x="${x}" y="${baseY - adjustedHeight}" width="${barWidth}" height="${adjustedHeight}" fill="${colors[i % colors.length]}" rx="4"/>`;
        bars += `<text x="${x + barWidth/2}" y="${baseY + 20}" text-anchor="middle" fill="#888" font-size="${height * 0.04}" font-family="Arial, sans-serif">${val}%</text>`;
      });

      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <rect width="100%" height="100%" fill="${bgColor}"/>
        <line x1="${startX - 5}" y1="${baseY}" x2="${width * 0.85}" y2="${baseY}" stroke="#444" stroke-width="2"/>
        ${bars}
        <text x="${width/2}" y="${height * 0.12}" text-anchor="middle" fill="white" font-size="${height * 0.06}" font-family="Arial, sans-serif" font-weight="bold">STATISTICS</text>
      </svg>`;
    }

    case 'progress_bar': {
      const targetPercent = (data.percentage as number) || 85;
      const currentPercent = targetPercent * easeOut;
      const barWidth = width * 0.7;
      const barHeight = height * 0.1;
      const barX = (width - barWidth) / 2;
      const barY = (height - barHeight) / 2;
      const fillWidth = barWidth * (currentPercent / 100);

      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <rect width="100%" height="100%" fill="${bgColor}"/>
        <rect x="${barX}" y="${barY}" width="${barWidth}" height="${barHeight}" fill="#333" rx="${barHeight/2}"/>
        <rect x="${barX}" y="${barY}" width="${fillWidth}" height="${barHeight}" fill="#3B82F6" rx="${barHeight/2}"/>
        <text x="${width/2}" y="${barY - 20}" text-anchor="middle" fill="white" font-size="${height * 0.08}" font-family="Arial, sans-serif" font-weight="bold">${Math.round(currentPercent)}%</text>
        <text x="${width/2}" y="${barY + barHeight + 35}" text-anchor="middle" fill="#888" font-size="${height * 0.05}" font-family="Arial, sans-serif">PROGRESS</text>
      </svg>`;
    }

    case 'checkmark': {
      const scale = easeOut;
      const centerX = width / 2;
      const centerY = height / 2;
      const size = Math.min(width, height) * 0.35;

      // Checkmark path
      const checkPath = scale > 0.3 ? `
        M ${centerX - size * 0.35} ${centerY}
        L ${centerX - size * 0.05} ${centerY + size * 0.3}
        L ${centerX + size * 0.4} ${centerY - size * 0.25}
      ` : '';

      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <rect width="100%" height="100%" fill="${bgColor}"/>
        <circle cx="${centerX}" cy="${centerY}" r="${size * scale}" fill="#22C55E" opacity="0.2"/>
        <circle cx="${centerX}" cy="${centerY}" r="${size * 0.85 * scale}" fill="#22C55E"/>
        <path d="${checkPath}" fill="none" stroke="white" stroke-width="${size * 0.12}" stroke-linecap="round" stroke-linejoin="round" opacity="${scale > 0.5 ? 1 : 0}"/>
        <text x="${centerX}" y="${centerY + size + 40}" text-anchor="middle" fill="#22C55E" font-size="${height * 0.06}" font-family="Arial, sans-serif" font-weight="bold">SUCCESS</text>
      </svg>`;
    }

    case 'comparison': {
      const valueA = (data.valueA as number) || 35;
      const valueB = (data.valueB as number) || 80;
      const barWidth = width * 0.3;
      const maxHeight = height * 0.5;
      const baseY = height * 0.75;
      const barAX = width * 0.2;
      const barBX = width * 0.55;

      const heightA = (valueA / 100) * maxHeight * easeOut;
      const heightB = (valueB / 100) * maxHeight * easeOut;

      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <rect width="100%" height="100%" fill="${bgColor}"/>
        <rect x="${barAX}" y="${baseY - heightA}" width="${barWidth}" height="${heightA}" fill="#EF4444" rx="4"/>
        <rect x="${barBX}" y="${baseY - heightB}" width="${barWidth}" height="${heightB}" fill="#22C55E" rx="4"/>
        <text x="${barAX + barWidth/2}" y="${baseY + 30}" text-anchor="middle" fill="#EF4444" font-size="${height * 0.05}" font-family="Arial, sans-serif" font-weight="bold">BEFORE</text>
        <text x="${barBX + barWidth/2}" y="${baseY + 30}" text-anchor="middle" fill="#22C55E" font-size="${height * 0.05}" font-family="Arial, sans-serif" font-weight="bold">AFTER</text>
        <text x="${barAX + barWidth/2}" y="${baseY - heightA - 10}" text-anchor="middle" fill="white" font-size="${height * 0.05}" font-family="Arial, sans-serif">${valueA}%</text>
        <text x="${barBX + barWidth/2}" y="${baseY - heightB - 10}" text-anchor="middle" fill="white" font-size="${height * 0.05}" font-family="Arial, sans-serif">${valueB}%</text>
      </svg>`;
    }

    case 'percentage_ring': {
      const percentage = (data.percentage as number) || 75;
      const currentPct = percentage * easeOut;
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) * 0.35;
      const strokeWidth = radius * 0.15;
      const circumference = 2 * Math.PI * radius;
      const dashOffset = circumference * (1 - currentPct / 100);

      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <rect width="100%" height="100%" fill="${bgColor}"/>
        <circle cx="${centerX}" cy="${centerY}" r="${radius}" fill="none" stroke="#333" stroke-width="${strokeWidth}"/>
        <circle cx="${centerX}" cy="${centerY}" r="${radius}" fill="none" stroke="#06B6D4" stroke-width="${strokeWidth}"
          stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}"
          transform="rotate(-90 ${centerX} ${centerY})" stroke-linecap="round"/>
        <text x="${centerX}" y="${centerY + height * 0.04}" text-anchor="middle" fill="white" font-size="${height * 0.14}" font-family="Arial, sans-serif" font-weight="bold">${Math.round(currentPct)}%</text>
      </svg>`;
    }

    case 'pulse': {
      const pulsePhase = (frame % 30) / 30;
      const pulseScale = 0.8 + 0.2 * Math.sin(pulsePhase * Math.PI * 2);
      const centerX = width / 2;
      const centerY = height / 2;
      const baseRadius = Math.min(width, height) * 0.25;

      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <rect width="100%" height="100%" fill="${bgColor}"/>
        <circle cx="${centerX}" cy="${centerY}" r="${baseRadius * pulseScale * 1.3}" fill="#00ff88" opacity="0.1"/>
        <circle cx="${centerX}" cy="${centerY}" r="${baseRadius * pulseScale * 1.15}" fill="#00ff88" opacity="0.2"/>
        <circle cx="${centerX}" cy="${centerY}" r="${baseRadius * pulseScale}" fill="#00ff88"/>
      </svg>`;
    }

    case 'highlight': {
      const pulsePhase = (frame % 45) / 45;
      const glowIntensity = 0.3 + 0.2 * Math.sin(pulsePhase * Math.PI * 2);
      const centerX = width / 2;
      const centerY = height / 2;

      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <rect width="100%" height="100%" fill="${bgColor}"/>
        <defs>
          <radialGradient id="glow">
            <stop offset="0%" style="stop-color:#FBBF24;stop-opacity:${glowIntensity}"/>
            <stop offset="100%" style="stop-color:#FBBF24;stop-opacity:0"/>
          </radialGradient>
        </defs>
        <circle cx="${centerX}" cy="${centerY}" r="${Math.min(width, height) * 0.4}" fill="url(#glow)"/>
        <text x="${centerX}" y="${centerY - 20}" text-anchor="middle" fill="#FBBF24" font-size="${height * 0.2}" font-family="Arial, sans-serif">!</text>
        <text x="${centerX}" y="${centerY + height * 0.25}" text-anchor="middle" fill="#FBBF24" font-size="${height * 0.06}" font-family="Arial, sans-serif" font-weight="bold">KEY POINT</text>
      </svg>`;
    }

    default:
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <rect width="100%" height="100%" fill="${bgColor}"/>
        <circle cx="${width/2}" cy="${height/2}" r="${Math.min(width, height) * 0.2}" fill="#00ff88"/>
      </svg>`;
  }
}

/**
 * Generate animation video using sharp for frame generation
 */
export async function generateAnimation(
  type: AnimationType,
  outputPath: string,
  duration: number,
  width: number,
  height: number,
  data?: Record<string, unknown>
): Promise<string> {
  const fps = 30;
  const totalFrames = Math.ceil(duration * fps);
  const framesDir = path.join(path.dirname(outputPath), `frames_${Date.now()}`);

  logger.debug(`[SharpAnimation] Generating ${type} animation: ${totalFrames} frames`);

  // Create frames directory
  fs.mkdirSync(framesDir, { recursive: true });

  try {
    // Generate each frame
    for (let frame = 0; frame < totalFrames; frame++) {
      const svg = createAnimationSVG(type, {
        width,
        height,
        frame,
        totalFrames,
        data
      });

      const framePath = path.join(framesDir, `frame_${String(frame).padStart(4, '0')}.png`);
      await sharp(Buffer.from(svg)).png().toFile(framePath);
    }

    // Convert frames to video
    await framesToVideo(framesDir, outputPath, fps);

    logger.debug(`[SharpAnimation] Animation created: ${outputPath}`);
    return outputPath;
  } finally {
    // Cleanup frames
    try {
      fs.rmSync(framesDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Keyword patterns for matching context to animation types
 */
const ANIMATION_PATTERNS: Array<{
  keywords: string[];
  type: AnimationType;
  weight: number;
  data?: Record<string, unknown>;
}> = [
  { keywords: ['growth', 'increase', 'rise', 'profit', 'success', 'gains', 'boost', 'surge'], type: 'graph_up', weight: 10 },
  { keywords: ['crash', 'fall', 'decline', 'loss', 'drop', 'plummet', 'decrease'], type: 'graph_down', weight: 10 },
  { keywords: ['money', 'dollar', 'revenue', 'income', 'million', 'billion', 'price', 'cost', '$'], type: 'counter', weight: 9 },
  { keywords: ['percent', '%', 'percentage', 'rate', 'conversion'], type: 'percentage_ring', weight: 9 },
  { keywords: ['majority', 'most people', 'portion', 'share', 'distribution'], type: 'pie_chart', weight: 8 },
  { keywords: ['compare', 'versus', 'vs', 'better than', 'difference', 'before and after'], type: 'comparison', weight: 10 },
  { keywords: ['data', 'statistics', 'analytics', 'metrics', 'results', 'chart'], type: 'bar_chart', weight: 7 },
  { keywords: ['progress', 'loading', 'completion', 'done', 'goal', 'target'], type: 'progress_bar', weight: 8 },
  { keywords: ['success', 'correct', 'approved', 'verified', 'achieved', 'completed', 'check'], type: 'checkmark', weight: 9 },
  { keywords: ['important', 'key', 'crucial', 'highlight', 'attention', 'notice', 'remember'], type: 'highlight', weight: 7 },
  { keywords: ['amazing', 'incredible', 'wow', 'shocking', 'exciting'], type: 'pulse', weight: 5 },
];

/**
 * Extract numeric value from context for data-driven animations
 */
function extractNumericValue(context: string): number | undefined {
  // Match patterns like "$1.5 million", "75%", "1000", etc.
  const percentMatch = context.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percentMatch) return parseFloat(percentMatch[1]);

  const moneyMatch = context.match(/\$?\s*(\d+(?:\.\d+)?)\s*(million|billion|thousand|k|m|b)?/i);
  if (moneyMatch) {
    let value = parseFloat(moneyMatch[1]);
    const multiplier = moneyMatch[2]?.toLowerCase();
    if (multiplier === 'billion' || multiplier === 'b') value *= 1000000000;
    else if (multiplier === 'million' || multiplier === 'm') value *= 1000000;
    else if (multiplier === 'thousand' || multiplier === 'k') value *= 1000;
    return value;
  }

  const numberMatch = context.match(/\b(\d+(?:\.\d+)?)\b/);
  if (numberMatch) return parseFloat(numberMatch[1]);

  return undefined;
}

/**
 * Select animation type and extract data from context
 */
export function selectAnimationFromContext(context: string): { type: AnimationType; data: Record<string, unknown> } {
  const lowerContext = context.toLowerCase();
  const scores: Map<AnimationType, number> = new Map();

  for (const pattern of ANIMATION_PATTERNS) {
    for (const keyword of pattern.keywords) {
      if (lowerContext.includes(keyword)) {
        const currentScore = scores.get(pattern.type) || 0;
        scores.set(pattern.type, currentScore + pattern.weight);
      }
    }
  }

  let bestType: AnimationType = 'pulse';
  let highestScore = 0;

  for (const [type, score] of scores) {
    if (score > highestScore) {
      highestScore = score;
      bestType = type;
    }
  }

  // Extract data for data-driven animations
  const data: Record<string, unknown> = {};
  const numericValue = extractNumericValue(context);

  if (numericValue !== undefined) {
    if (bestType === 'counter') {
      data.value = numericValue;
      data.prefix = lowerContext.includes('$') ? '$' : '';
    } else if (['percentage_ring', 'pie_chart', 'progress_bar'].includes(bestType)) {
      data.percentage = Math.min(100, numericValue);
    } else if (bestType === 'comparison') {
      // Try to extract two values for comparison
      const numbers = context.match(/(\d+(?:\.\d+)?)/g);
      if (numbers && numbers.length >= 2) {
        data.valueA = parseFloat(numbers[0]);
        data.valueB = parseFloat(numbers[1]);
      }
    }
  }

  logger.debug(`[SharpAnimation] Context "${context.slice(0, 50)}..." -> ${bestType} (score: ${highestScore})`);
  return { type: bestType, data };
}

/**
 * Generate contextual animation based on transcript context
 */
export async function generateContextualAnimation(
  outputPath: string,
  duration: number,
  width: number,
  height: number,
  context: string,
  style: 'minimal' | 'dynamic' | 'data-focused' = 'dynamic'
): Promise<string> {
  const { type, data } = selectAnimationFromContext(context);

  // Apply style preferences
  let finalType = type;
  if (style === 'minimal' && type === 'bar_chart') finalType = 'progress_bar';
  if (style === 'data-focused' && type === 'pulse') finalType = 'bar_chart';

  return generateAnimation(finalType, outputPath, duration, width, height, data);
}

/**
 * Animation cache for reusing common animations
 */
const animationCache = new Map<string, string>();

/**
 * Get or generate cached animation
 */
export async function getCachedAnimation(
  cacheDir: string,
  type: AnimationType,
  duration: number,
  width: number,
  height: number,
  data?: Record<string, unknown>
): Promise<string> {
  const cacheKey = `${type}_${duration}_${width}x${height}_${JSON.stringify(data || {})}`;

  if (animationCache.has(cacheKey)) {
    const cachedPath = animationCache.get(cacheKey)!;
    if (fs.existsSync(cachedPath)) {
      return cachedPath;
    }
  }

  const outputPath = path.join(cacheDir, `anim_${type}_${Date.now()}.mp4`);
  await generateAnimation(type, outputPath, duration, width, height, data);
  animationCache.set(cacheKey, outputPath);

  return outputPath;
}
