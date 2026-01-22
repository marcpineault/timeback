import fs from 'fs';
import path from 'path';

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
            console.log(`[Cleanup] Deleted old file: ${filepath}`);
          }
        } catch (err) {
          console.error(`[Cleanup] Error checking file ${filepath}:`, err);
        }
      });
    } catch (err) {
      console.error(`[Cleanup] Error reading directory ${dir}:`, err);
    }
  });
}
