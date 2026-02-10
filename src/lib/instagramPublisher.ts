/**
 * Instagram Publisher
 *
 * Handles the actual publishing of scheduled posts to Instagram.
 * Called by the cron job to process due posts.
 */

import { prisma } from './db';
import { logger } from './logger';
import { publishReel, getValidToken } from './instagram';

const MAX_RETRIES = 3;
const STALE_UPLOADING_MINUTES = 10;

/**
 * Recover posts stuck in UPLOADING status (e.g., from a container restart mid-publish).
 * Resets them to SCHEDULED for retry, or marks as FAILED if retries exhausted.
 */
async function recoverStaleUploadingPosts(): Promise<number> {
  const staleThreshold = new Date(Date.now() - STALE_UPLOADING_MINUTES * 60 * 1000);

  const stalePosts = await prisma.scheduledPost.findMany({
    where: {
      status: 'UPLOADING',
      lastAttemptAt: { lte: staleThreshold },
    },
    include: { video: true },
  });

  let recovered = 0;

  for (const post of stalePosts) {
    const newRetryCount = post.retryCount + 1;

    if (newRetryCount >= MAX_RETRIES) {
      await prisma.scheduledPost.update({
        where: { id: post.id },
        data: {
          status: 'FAILED',
          retryCount: newRetryCount,
          lastError: 'Post was stuck in UPLOADING state (container likely restarted mid-publish)',
        },
      });

      await prisma.notification.create({
        data: {
          userId: post.userId,
          type: 'post_failed',
          title: 'Post failed to publish',
          message: `Your video "${post.video.originalName}" failed after ${MAX_RETRIES} attempts. The server restarted during publishing.`,
          data: { postId: post.id, videoId: post.videoId },
        },
      });
    } else {
      await prisma.scheduledPost.update({
        where: { id: post.id },
        data: {
          status: 'SCHEDULED',
          retryCount: newRetryCount,
          lastError: 'Recovered from stale UPLOADING state (container restarted mid-publish)',
        },
      });
    }

    recovered++;
    logger.info('Recovered stale UPLOADING post', {
      postId: post.id,
      newRetryCount,
      newStatus: newRetryCount >= MAX_RETRIES ? 'FAILED' : 'SCHEDULED',
    });
  }

  return recovered;
}

/**
 * Process all posts that are due for publishing.
 * Called by the cron endpoint every minute.
 */
export async function publishDuePosts(): Promise<{
  published: number;
  failed: number;
  recovered: number;
  errors: string[];
}> {
  // First, recover any posts stuck in UPLOADING from a previous crash
  const recovered = await recoverStaleUploadingPosts();
  if (recovered > 0) {
    logger.info(`Recovered ${recovered} stale UPLOADING posts`);
  }

  const now = new Date();
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

  // Find posts that are due: scheduled time has passed, but not more than 10 min ago
  const duePosts = await prisma.scheduledPost.findMany({
    where: {
      status: 'SCHEDULED',
      scheduledFor: {
        lte: now,
        gte: tenMinutesAgo,
      },
    },
    include: {
      video: true,
      instagramAccount: true,
    },
    orderBy: { scheduledFor: 'asc' },
    take: 10, // Process max 10 at a time to stay within rate limits
  });

  let published = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const post of duePosts) {
    try {
      // Atomically claim the post by transitioning SCHEDULED -> UPLOADING.
      // This prevents duplicate publishes if multiple cron requests run concurrently.
      const claimed = await prisma.$executeRaw`
        UPDATE "ScheduledPost"
        SET "status" = 'UPLOADING', "lastAttemptAt" = ${now}
        WHERE "id" = ${post.id} AND "status" = 'SCHEDULED'
      `;

      if (claimed === 0) {
        // Another cron instance already claimed this post
        logger.info('Post already claimed by another process', { postId: post.id });
        continue;
      }

      // Verify video has a processed URL
      if (!post.video.processedUrl) {
        throw new Error('Video has no processed URL');
      }

      // Get a valid token (refreshes if needed)
      const accessToken = await getValidToken(post.instagramAccountId);

      // Publish the reel
      const result = await publishReel({
        instagramUserId: post.instagramAccount.instagramUserId,
        accessToken,
        videoUrl: post.video.processedUrl,
        caption: post.caption,
        coverUrl: post.coverImageUrl || undefined,
      });

      // Mark as published
      await prisma.scheduledPost.update({
        where: { id: post.id },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          igContainerId: result.containerId,
          igMediaId: result.mediaId,
          igPermalink: result.permalink,
        },
      });

      // Update last published time on the account
      await prisma.instagramAccount.update({
        where: { id: post.instagramAccountId },
        data: { lastPublishedAt: new Date(), lastError: null },
      });

      published++;
      logger.info('Post published successfully', {
        postId: post.id,
        mediaId: result.mediaId,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const newRetryCount = post.retryCount + 1;

      if (newRetryCount >= MAX_RETRIES) {
        // Max retries reached — mark as failed
        await prisma.scheduledPost.update({
          where: { id: post.id },
          data: {
            status: 'FAILED',
            retryCount: newRetryCount,
            lastError: errorMessage,
            lastAttemptAt: now,
          },
        });

        // Create a notification for the user
        await prisma.notification.create({
          data: {
            userId: post.userId,
            type: 'post_failed',
            title: 'Post failed to publish',
            message: `Your video "${post.video.originalName}" failed to publish after ${MAX_RETRIES} attempts: ${errorMessage}`,
            data: { postId: post.id, videoId: post.videoId },
          },
        });

        failed++;
      } else {
        // Put back to SCHEDULED for retry in next cycle
        await prisma.scheduledPost.update({
          where: { id: post.id },
          data: {
            status: 'SCHEDULED',
            retryCount: newRetryCount,
            lastError: errorMessage,
            lastAttemptAt: now,
          },
        });
      }

      errors.push(`Post ${post.id}: ${errorMessage}`);
      logger.error('Failed to publish post', { postId: post.id, error: errorMessage });
    }
  }

  return { published, failed, recovered, errors };
}

/**
 * Refresh tokens that are expiring within 7 days.
 * Called by a daily cron job.
 */
export async function refreshExpiringTokens(): Promise<{
  refreshed: number;
  failed: number;
}> {
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const expiringAccounts = await prisma.instagramAccount.findMany({
    where: {
      isActive: true,
      tokenExpiresAt: { lte: sevenDaysFromNow },
    },
  });

  let refreshed = 0;
  let failedCount = 0;

  for (const account of expiringAccounts) {
    try {
      // getValidToken handles the refresh logic
      await getValidToken(account.id);
      refreshed++;
    } catch (error) {
      failedCount++;
      logger.error('Failed to refresh token', {
        accountId: account.id,
        error: error instanceof Error ? error.message : 'Unknown',
      });

      // Notify user their account needs reconnection
      await prisma.notification.create({
        data: {
          userId: account.userId,
          type: 'token_expiring',
          title: 'Instagram reconnection needed',
          message: `Your Instagram account @${account.instagramUsername} needs to be reconnected. Your access token is expiring and could not be refreshed.`,
          data: { accountId: account.id },
        },
      });
    }
  }

  return { refreshed, failed: failedCount };
}
