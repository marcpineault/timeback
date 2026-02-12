import OpenAI from 'openai';
import puppeteer from 'puppeteer-core';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { logger } from './logger';

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }
  return new OpenAI({ apiKey });
}

/**
 * Generate animation HTML/CSS using Claude API
 */
async function generateAnimationCode(
  context: string,
  width: number,
  height: number,
  duration: number,
  style: 'minimal' | 'dynamic' | 'playful' = 'dynamic'
): Promise<string> {
  const styleGuide = {
    minimal: 'Clean, simple, subtle animations. Use muted colors, thin lines, minimal elements. Professional and understated.',
    dynamic: 'Engaging motion graphics style. Use bold colors, smooth easing, satisfying animations. Modern and eye-catching.',
    playful: 'Fun, energetic animations. Use vibrant colors, bouncy easing, creative elements. Engaging and memorable.',
  };

  const prompt = `Create an HTML animation for a short-form video overlay. The animation should visually represent this context from the video transcript:

"${context}"

Requirements:
- Canvas size: ${width}x${height} pixels
- Duration: ${duration} seconds (animation should loop or hold at end)
- Style: ${styleGuide[style]}
- Dark semi-transparent background (#0f0f23 at 85% opacity)
- Use CSS animations (keyframes) - no JavaScript
- The animation should be self-contained in a single HTML file
- Make it visually engaging and relevant to the context
- Include relevant icons, charts, numbers, or graphics based on the content
- Use modern, clean typography (system fonts)
- Animations should be smooth with appropriate easing

For context about the content type:
- If it mentions money/revenue/cost: show animated counters or money graphics
- If it mentions growth/increase: show upward trending graphs or arrows
- If it mentions decline/loss: show downward trends in red
- If it mentions percentages: show animated progress rings or bars
- If it mentions comparisons: show side-by-side animated elements
- If it mentions time: show clock or timeline animations
- If it mentions success/achievement: show checkmarks or celebration elements

Return ONLY the complete HTML code, no explanations. The HTML should work standalone when opened in a browser.`;

  logger.debug(`[ClaudeAnimation] Generating animation for: "${context.slice(0, 50)}..."`);

  const completion = await getOpenAIClient().chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  let html = completion.choices[0]?.message?.content?.trim() || '';

  // Clean up the response - remove markdown code blocks if present
  html = html.replace(/```html\n?/g, '').replace(/```\n?/g, '').trim();

  // Ensure it starts with proper HTML
  if (!html.toLowerCase().startsWith('<!doctype') && !html.toLowerCase().startsWith('<html')) {
    html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;overflow:hidden;">${html}</body></html>`;
  }

  logger.debug(`[ClaudeAnimation] Generated ${html.length} bytes of HTML`);
  return html;
}

/**
 * Render HTML animation to video using Puppeteer
 */
async function renderHtmlToVideo(
  html: string,
  outputPath: string,
  width: number,
  height: number,
  duration: number,
  fps: number = 30
): Promise<string> {
  const totalFrames = Math.ceil(duration * fps);
  const framesDir = path.join(path.dirname(outputPath), `frames_${Date.now()}`);

  fs.mkdirSync(framesDir, { recursive: true });

  logger.debug(`[ClaudeAnimation] Rendering ${totalFrames} frames at ${fps}fps`);

  // Find Chrome/Chromium executable
  const chromePaths = [
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    process.env.CHROME_PATH,
  ].filter(Boolean);

  let executablePath: string | undefined;
  for (const p of chromePaths) {
    if (p && fs.existsSync(p)) {
      executablePath = p;
      break;
    }
  }

  if (!executablePath) {
    throw new Error('Chrome/Chromium not found. Install chromium in Docker or set CHROME_PATH.');
  }

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height });

    // Load the HTML content
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Wait for initial render
    await new Promise(resolve => setTimeout(resolve, 100));

    // Capture frames
    for (let frame = 0; frame < totalFrames; frame++) {
      const framePath = path.join(framesDir, `frame_${String(frame).padStart(4, '0')}.png`);

      // Set the animation time by injecting CSS
      const animationTime = (frame / fps);
      await page.evaluate((time) => {
        document.body.style.setProperty('--animation-time', `${time}s`);
        // Force all animations to the specific time
        const style = document.createElement('style');
        style.textContent = `*, *::before, *::after { animation-play-state: paused !important; animation-delay: -${time}s !important; }`;
        style.id = 'frame-control';
        const existing = document.getElementById('frame-control');
        if (existing) existing.remove();
        document.head.appendChild(style);
      }, animationTime);

      await page.screenshot({ path: framePath, type: 'png' });

      if (frame % 30 === 0) {
        logger.debug(`[ClaudeAnimation] Captured frame ${frame + 1}/${totalFrames}`);
      }
    }

    // Convert frames to video using FFmpeg
    await framesToVideo(framesDir, outputPath, fps);

    logger.debug(`[ClaudeAnimation] Video created: ${outputPath}`);
    return outputPath;
  } finally {
    await browser.close();

    // Cleanup frames
    try {
      fs.rmSync(framesDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Convert frames to video using FFmpeg
 */
function framesToVideo(framesDir: string, outputPath: string, fps: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-framerate', String(fps),
      '-i', path.join(framesDir, 'frame_%04d.png'),
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      outputPath,
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
 * Generate a contextual animation video using Claude API
 */
export async function generateClaudeAnimation(
  outputPath: string,
  context: string,
  width: number,
  height: number,
  duration: number,
  style: 'minimal' | 'dynamic' | 'playful' = 'dynamic'
): Promise<string> {
  // Generate animation HTML using Claude
  const html = await generateAnimationCode(context, width, height, duration, style);

  // Save HTML for debugging (optional)
  const htmlPath = outputPath.replace(/\.[^.]+$/, '.html');
  fs.writeFileSync(htmlPath, html);
  logger.debug(`[ClaudeAnimation] Saved HTML to ${htmlPath}`);

  // Render to video
  await renderHtmlToVideo(html, outputPath, width, height, duration);

  // Cleanup HTML file
  try {
    fs.unlinkSync(htmlPath);
  } catch (e) {
    // Ignore
  }

  return outputPath;
}

/**
 * Test function - generate a sample animation
 */
export async function testClaudeAnimation(outputDir: string): Promise<string> {
  const testContext = "Revenue increased by 50% this quarter, reaching $1.5 million in total sales";
  const outputPath = path.join(outputDir, `test_animation_${Date.now()}.mp4`);

  logger.info(`[ClaudeAnimation] Running test with context: "${testContext}"`);

  return generateClaudeAnimation(
    outputPath,
    testContext,
    756,  // 70% of 1080
    672,  // 35% of 1920
    3,    // 3 seconds
    'dynamic'
  );
}
