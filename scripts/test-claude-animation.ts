/**
 * Test script for Claude-powered animation generation
 * Run with: npx tsx scripts/test-claude-animation.ts
 */

import { generateClaudeAnimation } from '../src/lib/claude-animations';
import path from 'path';
import fs from 'fs';

async function main() {
  const outputDir = path.join(process.cwd(), 'test-output');
  fs.mkdirSync(outputDir, { recursive: true });

  const testCases = [
    {
      context: "Revenue increased by 50% this quarter, reaching $1.5 million in total sales",
      style: 'dynamic' as const,
    },
    {
      context: "Our user base grew from 10,000 to 50,000 users in just 3 months",
      style: 'dynamic' as const,
    },
    {
      context: "Costs decreased by 30% after implementing the new system",
      style: 'minimal' as const,
    },
  ];

  for (let i = 0; i < testCases.length; i++) {
    const { context, style } = testCases[i];
    const outputPath = path.join(outputDir, `animation_${i + 1}_${style}.mp4`);

    console.log(`\n[Test ${i + 1}] Generating animation for: "${context.slice(0, 50)}..."`);
    console.log(`Style: ${style}`);

    try {
      const result = await generateClaudeAnimation(
        outputPath,
        context,
        756,   // 70% of 1080
        672,   // 35% of 1920
        3,     // 3 seconds
        style
      );
      console.log(`✓ Success: ${result}`);
    } catch (error) {
      console.error(`✗ Failed:`, error);
    }
  }

  console.log(`\nTest complete! Check ${outputDir} for output files.`);
}

main().catch(console.error);
