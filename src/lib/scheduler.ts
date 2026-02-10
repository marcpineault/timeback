/**
 * Internal Cron Scheduler
 *
 * Runs periodic tasks by directly calling the publishing and token refresh
 * functions on a timer. Designed for single-instance Railway deployment
 * where no external cron service is configured.
 *
 * The HTTP cron endpoints (/api/cron/publish, /api/cron/refresh-tokens)
 * remain available for manual triggering or future external cron services.
 */

import { logger } from './logger';

const PUBLISH_INTERVAL_MS = 60 * 1000; // Every 1 minute
const TOKEN_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // Every 24 hours

let publishIntervalId: ReturnType<typeof setInterval> | null = null;
let tokenRefreshIntervalId: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

async function runPublishCycle(): Promise<void> {
  try {
    const { publishDuePosts } = await import('./instagramPublisher');
    const result = await publishDuePosts();
    if (result.published > 0 || result.failed > 0 || result.recovered > 0) {
      logger.info('Publish cycle completed', result);
    }
  } catch (error) {
    logger.error('Publish cycle failed', { error: error instanceof Error ? error.message : error });
  }
}

async function runTokenRefresh(): Promise<void> {
  try {
    const { refreshExpiringTokens } = await import('./instagramPublisher');
    const result = await refreshExpiringTokens();
    if (result.refreshed > 0 || result.failed > 0) {
      logger.info('Token refresh cycle completed', result);
    }
  } catch (error) {
    logger.error('Token refresh cycle failed', { error: error instanceof Error ? error.message : error });
  }
}

export function startScheduler(): void {
  if (isRunning) {
    logger.warn('Scheduler already running, skipping duplicate start');
    return;
  }

  isRunning = true;
  logger.info('Starting internal cron scheduler', {
    publishInterval: `${PUBLISH_INTERVAL_MS / 1000}s`,
    tokenRefreshInterval: `${TOKEN_REFRESH_INTERVAL_MS / 1000 / 3600}h`,
  });

  // Delay first publish run by 30 seconds to let the server fully start
  setTimeout(() => runPublishCycle(), 30_000);

  publishIntervalId = setInterval(() => runPublishCycle(), PUBLISH_INTERVAL_MS);

  // Delay first token refresh by 5 minutes
  setTimeout(() => runTokenRefresh(), 5 * 60_000);

  tokenRefreshIntervalId = setInterval(() => runTokenRefresh(), TOKEN_REFRESH_INTERVAL_MS);
}

export function stopScheduler(): void {
  if (publishIntervalId) clearInterval(publishIntervalId);
  if (tokenRefreshIntervalId) clearInterval(tokenRefreshIntervalId);
  publishIntervalId = null;
  tokenRefreshIntervalId = null;
  isRunning = false;
  logger.info('Internal cron scheduler stopped');
}
