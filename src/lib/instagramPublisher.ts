/**
 * Instagram Publisher
 *
 * Handles the actual publishing of scheduled posts to Instagram.
 * Called by the cron job to process due posts.
 */

import { prisma } from './db';
import { logger } from './logger';
import { publishReel, getValidToken, PublishError } from './instagram';
import { isS3Configured, getProcessedVideoUrl } from './s3';

const MAX_RETRIES = 3;
const STALE_UPLOADING_MINUTES = 10;

/**
 * Resolve a stored processedUrl to a publicly accessible URL that Instagram can download.
 *
 * processedUrl is stored as either:
 * - An S3 key (e.g. "processed/12345-abc-video.mp4") when S3/R2 is configured
 * - A relative path (e.g. "/api/download/video.mp4") when using local storage
 * - Already a full URL (starts with "http")
 */
async function resolveVideoUrl(processedUrl: string): Promise<string> {
  // Already a full URL
  if (processedUrl.startsWith('http://') || processedUrl.startsWith('https://')) {
    return processedUrl;
  }

  // S3 key — generate a presigned URL
  if (processedUrl.startsWith('processed/') && isS3Configured()) {
    const presignedUrl = await getProcessedVideoUrl(processedUrl);
    logger.info('Resolved S3 key to presigned URL for Instagram publishing', {
      s3Key: processedUrl,
    });
    return presignedUrl;
  }

  // Local relative path — prepend app URL
  if (processedUrl.startsWith('/')) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      throw new Error(
        'Cannot publish video: NEXT_PUBLIC_APP_URL is not configured and video is stored locally'
      );
    }
    return `${appUrl}${processedUrl}`;
  }

  throw new Error(`Cannot resolve video URL for Instagram publishing: ${processedUrl}`);
}

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

  // Find ALL overdue posts — no artificial time window cutoff.
  // Posts are published even if the scheduled time was missed (e.g., server restart).
  const duePosts = await prisma.scheduledPost.findMany({
    where: {
      status: 'SCHEDULED',
      scheduledFor: {
        lte: now,
      },
    },
    include: {
      video: true,
      instagramAccount: true,
    },
    orderBy: { scheduledFor: 'asc' },
    take: 10, // Process max 10 at a time to stay within rate limits
  });

  // Log if catching up on significantly delayed posts
  if (duePosts.length > 0) {
    const oldestDue = duePosts[0];
    const delayMinutes = Math.round((now.getTime() - oldestDue.scheduledFor.getTime()) / 60000);
    if (delayMinutes > 10) {
      logger.warn('Catching up on delayed posts', {
        oldestPostId: oldestDue.id,
        scheduledFor: oldestDue.scheduledFor.toISOString(),
        delayMinutes,
        postsToProcess: duePosts.length,
      });
    }
  }

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

      // Resolve stored processedUrl to a publicly accessible URL for Instagram
      const videoUrl = await resolveVideoUrl(post.video.processedUrl);

      // Get a valid token (refreshes if needed)
      const accessToken = await getValidToken(post.instagramAccountId);

      // Publish the reel
      const result = await publishReel({
        instagramUserId: post.instagramAccount.instagramUserId,
        accessToken,
        videoUrl,
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

      // Notify if post was published significantly late
      const delayMs = now.getTime() - post.scheduledFor.getTime();
      if (delayMs > 30 * 60 * 1000) {
        await prisma.notification.create({
          data: {
            userId: post.userId,
            type: 'post_delayed',
            title: 'Post published late',
            message: `Your video "${post.video.originalName}" was scheduled for ${post.scheduledFor.toISOString()} but published ${Math.round(delayMs / 60000)} minutes late.`,
            data: { postId: post.id, delayMinutes: Math.round(delayMs / 60000) },
          },
        });
      }

      published++;
      logger.info('Post published successfully', {
        postId: post.id,
        mediaId: result.mediaId,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const newRetryCount = post.retryCount + 1;

      // Check if this is a classified Facebook error
      let shouldRetry = true;
      if (error instanceof PublishError) {
        shouldRetry = error.classification.shouldRetry;

        if (error.classification.shouldDeactivateAccount) {
          await prisma.instagramAccount.update({
            where: { id: post.instagramAccountId },
            data: {
              isActive: false,
              lastError: error.classification.userMessage,
            },
          });
          logger.warn('Deactivated Instagram account due to auth error', {
            accountId: post.instagramAccountId,
            category: error.classification.category,
          });
        }
      }

      if (!shouldRetry || newRetryCount >= MAX_RETRIES) {
        // Non-retryable error or max retries reached — mark as failed
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
            message: `Your video "${post.video.originalName}" failed to publish: ${errorMessage}`,
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
      logger.error('Failed to publish post', {
        postId: post.id,
        error: errorMessage,
        category: error instanceof PublishError ? error.classification.category : 'unknown',
        shouldRetry,
        retryCount: newRetryCount,
      });
    }
  }

  return { published, failed, recovered, errors };
}

/**
 * Publish a single post immediately (on-demand "Publish Now").
 * Unlike publishDuePosts, this targets a specific post regardless of its scheduled time.
 */
export async function publishPost(postId: string, userId: string): Promise<{
  success: boolean;
  error?: string;
  mediaId?: string;
  permalink?: string;
}> {
  const post = await prisma.scheduledPost.findFirst({
    where: { id: postId, userId },
    include: {
      video: true,
      instagramAccount: true,
    },
  });

  if (!post) {
    return { success: false, error: 'Post not found' };
  }

  if (post.status === 'PUBLISHED') {
    return { success: false, error: 'Post is already published' };
  }

  if (post.status === 'UPLOADING') {
    return { success: false, error: 'Post is currently being uploaded' };
  }

  if (post.status === 'CANCELLED') {
    return { success: false, error: 'Post has been cancelled' };
  }

  if (!post.video.processedUrl) {
    return { success: false, error: 'Video has no processed URL' };
  }

  // Atomically claim the post
  const now = new Date();
  const claimed = await prisma.$executeRaw`
    UPDATE "ScheduledPost"
    SET "status" = 'UPLOADING', "lastAttemptAt" = ${now}
    WHERE "id" = ${post.id} AND "status" IN ('QUEUED', 'SCHEDULED', 'FAILED')
  `;

  if (claimed === 0) {
    return { success: false, error: 'Post could not be claimed for publishing (it may already be in progress)' };
  }

  try {
    const videoUrl = await resolveVideoUrl(post.video.processedUrl);
    const accessToken = await getValidToken(post.instagramAccountId);

    const result = await publishReel({
      instagramUserId: post.instagramAccount.instagramUserId,
      accessToken,
      videoUrl,
      caption: post.caption,
      coverUrl: post.coverImageUrl || undefined,
    });

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

    await prisma.instagramAccount.update({
      where: { id: post.instagramAccountId },
      data: { lastPublishedAt: new Date(), lastError: null },
    });

    logger.info('Post published immediately via Publish Now', {
      postId: post.id,
      mediaId: result.mediaId,
    });

    return { success: true, mediaId: result.mediaId, permalink: result.permalink };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const newRetryCount = post.retryCount + 1;

    // On failure, mark as FAILED (user explicitly triggered this, no silent retry)
    await prisma.scheduledPost.update({
      where: { id: post.id },
      data: {
        status: 'FAILED',
        retryCount: newRetryCount,
        lastError: errorMessage,
        lastAttemptAt: now,
      },
    });

    await prisma.instagramAccount.update({
      where: { id: post.instagramAccountId },
      data: { lastError: errorMessage },
    });

    logger.error('Publish Now failed', { postId: post.id, error: errorMessage });

    return { success: false, error: errorMessage };
  }
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
    // Legacy accounts without userAccessToken cannot be refreshed — prompt reconnection
    if (!account.userAccessToken) {
      logger.warn('Account missing userAccessToken, prompting reconnection', {
        accountId: account.id,
        instagramUsername: account.instagramUsername,
      });
      await prisma.instagramAccount.update({
        where: { id: account.id },
        data: { isActive: false, lastError: 'Please reconnect your Instagram account (system update).' },
      });
      await prisma.notification.create({
        data: {
          userId: account.userId,
          type: 'reconnection_needed',
          title: 'Instagram reconnection required',
          message: `Your Instagram account @${account.instagramUsername} needs to be reconnected due to a system update. Please visit your schedule settings to reconnect.`,
          data: { accountId: account.id },
        },
      });
      failedCount++;
      continue;
    }

    try {
      // getValidToken handles the refresh logic (now uses userAccessToken internally)
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
