import fs from 'fs';
import path from 'path';
import { logger } from './logger';

const MAX_FILE_AGE_HOURS = 1; // Delete files older than 1 hour

export function cleanupOldFiles() {
  const uploadsDir = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
  const processedDir = process.env.PROCESSED_DIR || path.join(process.cwd(), 'processed');

  const maxAge = MAX_FILE_AGE_HOURS * 60 * 60 * 1000; // Convert to milliseconds
  const now = Date.now();

  [uploadsDir, processedDir].forEach(dir => {
    if (!fs.existsSync(dir)) return;

    try {
      const files = fs.readdirSync(dir);

      files.forEach(file => {
        // Skip .gitkeep files
        if (file === '.gitkeep') return;

        const filepath = path.join(dir, file);

        try {
          const stat = fs.statSync(filepath);
          const fileAge = now - stat.mtimeMs;

          if (fileAge > maxAge) {
            fs.unlinkSync(filepath);
            logger.debug('Deleted old file', { filepath });
          }
        } catch (err) {
          logger.warn('Error checking file during cleanup', { filepath, error: String(err) });
        }
      });
    } catch (err) {
      logger.warn('Error reading directory during cleanup', { dir, error: String(err) });
    }
  });
}
