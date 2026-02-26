import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { logger } from './logger';
import { isFileLocked } from './fileLock';
import { cleanupStaleMultipartUploads, isS3Configured, deleteS3Object } from './s3';
import { prisma } from './db';

const MAX_FILE_AGE_HOURS = 1; // Delete files older than 1 hour
const CONCURRENCY_LIMIT = 5; // Process 5 files at a time
const VIDEO_CLEANUP_GRACE_HOURS = 24; // Wait 24 hours after last post reaches terminal state

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

          // Skip files that are currently being processed
          if (isFileLocked(filepath)) {
            logger.debug('Skipping locked file during cleanup', { filepath });
            return;
          }

          try {
            // SECURITY: Use lstat instead of stat to detect symlinks
            const stat = await fs.lstat(filepath);

            // Skip symlinks to prevent following malicious links
            if (stat.isSymbolicLink()) {
              logger.warn('Skipping symlink during cleanup', { filepath });
              return;
            }

            const fileAge = now - stat.mtimeMs;

            if (fileAge > maxAge) {
              // Double-check lock before deleting (in case it was acquired during stat)
              if (isFileLocked(filepath)) {
                logger.debug('Skipping newly locked file during cleanup', { filepath });
                return;
              }
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
    // Abort incomplete multipart uploads older than 1 hour in R2
    cleanupStaleMultipartUploads(MAX_FILE_AGE_HOURS * 60 * 60 * 1000).then(count => {
      if (count > 0) {
        logger.info(`Cleaned up ${count} stale multipart upload(s) in R2`);
      }
    }).catch(err => {
      logger.warn('Multipart upload cleanup failed', { error: String(err) });
    }),
  ]);
}

/**
 * Clean up S3/R2 video files for posts that have reached a terminal state
 * (PUBLISHED, FAILED, or CANCELLED).
 *
 * Safety rules:
 * - Only deletes when ALL scheduled posts for a video are in terminal states
 * - Waits VIDEO_CLEANUP_GRACE_HOURS after the last post was updated
 * - Only targets S3 keys (processedUrl starting with "processed/")
 * - Clears the URL fields in the database after deletion
 */
export async function cleanupPublishedVideoStorage(): Promise<{ deleted: number; errors: number }> {
  if (!isS3Configured()) {
    return { deleted: 0, errors: 0 };
  }

  const graceCutoff = new Date(Date.now() - VIDEO_CLEANUP_GRACE_HOURS * 60 * 60 * 1000);

  // Find videos where:
  // 1. processedUrl is an S3 key (starts with "processed/")
  // 2. At least one ScheduledPost exists
  // 3. ALL ScheduledPosts are in terminal states
  // 4. ALL ScheduledPosts were last updated before the grace cutoff
  const videos = await prisma.video.findMany({
    where: {
      processedUrl: { startsWith: 'processed/' },
      scheduledPosts: {
        some: {},
        every: {
          status: { in: ['PUBLISHED', 'FAILED', 'CANCELLED'] },
          updatedAt: { lte: graceCutoff },
        },
      },
    },
    select: {
      id: true,
      processedUrl: true,
      originalUrl: true,
    },
  });

  if (videos.length === 0) {
    return { deleted: 0, errors: 0 };
  }

  logger.info(`Found ${videos.length} video(s) eligible for S3 cleanup`);

  let deleted = 0;
  let errors = 0;

  for (const video of videos) {
    try {
      // Delete processed video from S3
      if (video.processedUrl) {
        await deleteS3Object(video.processedUrl);
        logger.info('Deleted processed video from S3', { videoId: video.id, key: video.processedUrl });
      }

      // Delete original upload from S3 if it's also an S3 key
      if (video.originalUrl?.startsWith('uploads/')) {
        await deleteS3Object(video.originalUrl);
        logger.info('Deleted original upload from S3', { videoId: video.id, key: video.originalUrl });
      }

      // Clear URLs in database so we don't try to delete again
      await prisma.video.update({
        where: { id: video.id },
        data: {
          processedUrl: null,
          originalUrl: null,
        },
      });

      deleted++;
    } catch (err) {
      errors++;
      logger.warn('Failed to clean up S3 video', {
        videoId: video.id,
        key: video.processedUrl,
        error: String(err),
      });
    }
  }

  if (deleted > 0 || errors > 0) {
    logger.info('S3 video cleanup completed', { deleted, errors });
  }

  return { deleted, errors };
}
