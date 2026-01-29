import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { logger } from './logger';

const MAX_FILE_AGE_HOURS = 1; // Delete files older than 1 hour
const CONCURRENCY_LIMIT = 5; // Process 5 files at a time

export async function cleanupOldFiles(): Promise<void> {
  const uploadsDir = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
  const processedDir = process.env.PROCESSED_DIR || path.join(process.cwd(), 'processed');

  const maxAge = MAX_FILE_AGE_HOURS * 60 * 60 * 1000; // Convert to milliseconds
  const now = Date.now();

  const cleanupDir = async (dir: string) => {
    if (!existsSync(dir)) return;

    try {
      const files = await fs.readdir(dir);

      // Process files in batches with concurrency limit
      for (let i = 0; i < files.length; i += CONCURRENCY_LIMIT) {
        const batch = files.slice(i, i + CONCURRENCY_LIMIT);
        await Promise.all(batch.map(async (file) => {
          // Skip .gitkeep files
          if (file === '.gitkeep') return;

          const filepath = path.join(dir, file);

          try {
            const stat = await fs.stat(filepath);
            const fileAge = now - stat.mtimeMs;

            if (fileAge > maxAge) {
              await fs.unlink(filepath);
              logger.debug('Deleted old file', { filepath });
            }
          } catch (err) {
            logger.warn('Error checking file during cleanup', { filepath, error: String(err) });
          }
        }));
      }
    } catch (err) {
      logger.warn('Error reading directory during cleanup', { dir, error: String(err) });
    }
  };

  await Promise.all([
    cleanupDir(uploadsDir),
    cleanupDir(processedDir),
  ]);
}
