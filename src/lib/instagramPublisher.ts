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

/**
 * Process all posts that are due for publishing.
 * Called by the cron endpoint every minute.
 */
export async function publishDuePosts(): Promise<{
  published: number;
  failed: number;
  errors: string[];
}> {
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
      // Mark as uploading
      await prisma.scheduledPost.update({
        where: { id: post.id },
        data: { status: 'UPLOADING', lastAttemptAt: now },
      });

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

  return { published, failed, errors };
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
