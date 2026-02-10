/**
 * Schedule Queue Manager
 *
 * Handles assigning processed videos to posting time slots
 * and managing the posting queue.
 */

import { prisma } from './db';
import { logger } from './logger';
import { localTimeToUTC } from './timezone';

/**
 * Find the next open schedule slot for a user, starting from the given date.
 * Looks up to 30 days ahead.
 */
export async function findNextOpenSlot(
  userId: string,
  instagramAccountId: string,
  startFrom: Date = new Date()
): Promise<Date | null> {
  // Get user's active schedule slots
  const slots = await prisma.scheduleSlot.findMany({
    where: {
      userId,
      instagramAccountId,
      isActive: true,
    },
    orderBy: [{ dayOfWeek: 'asc' }, { timeOfDay: 'asc' }],
  });

  if (slots.length === 0) {
    return null;
  }

  // Get existing scheduled posts to find occupied slots
  const thirtyDaysOut = new Date(startFrom.getTime() + 30 * 24 * 60 * 60 * 1000);
  const existingPosts = await prisma.scheduledPost.findMany({
    where: {
      userId,
      instagramAccountId,
      status: { in: ['QUEUED', 'SCHEDULED', 'PROCESSING_VIDEO', 'UPLOADING'] },
      scheduledFor: {
        gte: startFrom,
        lte: thirtyDaysOut,
      },
    },
    select: { scheduledFor: true },
  });

  const occupiedTimes = new Set(
    existingPosts.map((p) => p.scheduledFor.toISOString())
  );

  // Iterate day by day for up to 30 days
  const current = new Date(startFrom);
  current.setSeconds(0, 0);

  for (let day = 0; day < 30; day++) {
    const checkDate = new Date(current);
    checkDate.setDate(current.getDate() + day);

    const dayOfWeek = checkDate.getDay(); // 0=Sunday ... 6=Saturday

    // Find slots for this day of the week
    const daySlots = slots.filter((s) => s.dayOfWeek === dayOfWeek);

    for (const slot of daySlots) {
      const slotTime = localTimeToUTC(checkDate, slot.timeOfDay, slot.timezone);

      // Skip if in the past
      if (slotTime <= startFrom) continue;

      // Skip if already occupied
      if (occupiedTimes.has(slotTime.toISOString())) continue;

      return slotTime;
    }
  }

  return null; // No open slots in the next 30 days
}

/**
 * Assign a processed video to the next available schedule slot.
 * Creates a ScheduledPost record.
 */
export async function assignVideoToNextSlot(params: {
  userId: string;
  videoId: string;
  instagramAccountId: string;
  caption: string;
  hashtags: string[];
}): Promise<{ scheduledFor: Date; postId: string } | null> {
  const { userId, videoId, instagramAccountId, caption, hashtags } = params;

  const nextSlot = await findNextOpenSlot(userId, instagramAccountId);

  if (!nextSlot) {
    logger.warn('No open schedule slots found', { userId });
    return null;
  }

  const post = await prisma.scheduledPost.create({
    data: {
      userId,
      videoId,
      instagramAccountId,
      caption,
      hashtags,
      scheduledFor: nextSlot,
      status: 'SCHEDULED',
    },
  });

  return { scheduledFor: nextSlot, postId: post.id };
}

/**
 * Get the user's upcoming posting queue.
 */
export async function getPostingQueue(
  userId: string,
  options: { limit?: number; includePublished?: boolean } = {}
) {
  const { limit = 50, includePublished = false } = options;

  const statusFilter = includePublished
    ? undefined
    : { in: ['QUEUED' as const, 'SCHEDULED' as const, 'PROCESSING_VIDEO' as const, 'UPLOADING' as const] };

  return prisma.scheduledPost.findMany({
    where: {
      userId,
      ...(statusFilter ? { status: statusFilter } : {}),
    },
    include: {
      video: {
        select: {
          id: true,
          originalName: true,
          processedUrl: true,
          status: true,
        },
      },
      instagramAccount: {
        select: {
          id: true,
          instagramUsername: true,
          instagramProfilePic: true,
        },
      },
    },
    orderBy: { scheduledFor: 'asc' },
    take: limit,
  });
}

/**
 * Reorder queue items by updating their scheduledFor times.
 * Accepts an ordered list of post IDs and reassigns them to slots in order.
 */
export async function reorderQueue(
  userId: string,
  instagramAccountId: string,
  orderedPostIds: string[]
): Promise<void> {
  // Get all upcoming slots
  const posts = await prisma.scheduledPost.findMany({
    where: {
      userId,
      instagramAccountId,
      id: { in: orderedPostIds },
      status: { in: ['QUEUED', 'SCHEDULED'] },
    },
    orderBy: { scheduledFor: 'asc' },
    select: { id: true, scheduledFor: true },
  });

  // Extract the existing scheduled times (sorted)
  const existingTimes = posts
    .map((p) => p.scheduledFor)
    .sort((a, b) => a.getTime() - b.getTime());

  // Reassign times in the new order
  const updates = orderedPostIds.flatMap((postId, index) => {
    if (index < existingTimes.length) {
      return [prisma.scheduledPost.update({
        where: { id: postId, userId },
        data: { scheduledFor: existingTimes[index] },
      })];
    }
    return [];
  });

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }
}

/**
 * Get a calendar view of scheduled posts for a date range.
 */
export async function getCalendarPosts(
  userId: string,
  startDate: Date,
  endDate: Date
) {
  return prisma.scheduledPost.findMany({
    where: {
      userId,
      scheduledFor: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      video: {
        select: {
          id: true,
          originalName: true,
          processedUrl: true,
        },
      },
      instagramAccount: {
        select: {
          instagramUsername: true,
        },
      },
    },
    orderBy: { scheduledFor: 'asc' },
  });
}

/**
 * Get queue stats for the user.
 */
export async function getQueueStats(userId: string) {
  const [scheduled, published, failed] = await Promise.all([
    prisma.scheduledPost.count({
      where: { userId, status: { in: ['QUEUED', 'SCHEDULED'] } },
    }),
    prisma.scheduledPost.count({
      where: { userId, status: 'PUBLISHED' },
    }),
    prisma.scheduledPost.count({
      where: { userId, status: 'FAILED' },
    }),
  ]);

  // Find next post time
  const nextPost = await prisma.scheduledPost.findFirst({
    where: {
      userId,
      status: 'SCHEDULED',
      scheduledFor: { gte: new Date() },
    },
    orderBy: { scheduledFor: 'asc' },
    select: { scheduledFor: true },
  });

  return {
    scheduled,
    published,
    failed,
    nextPostAt: nextPost?.scheduledFor || null,
  };
}
