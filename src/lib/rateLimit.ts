import { NextResponse } from 'next/server';
import { logger } from './logger';

interface RateLimitEntry {
  count: number;
  resetAt: number;
  lastAccess: number;
}

// In-memory store for rate limiting
// Note: For production at scale, use Redis or a similar distributed store
const rateLimitStore = new Map<string, RateLimitEntry>();

// Maximum number of entries to prevent memory exhaustion
const MAX_STORE_SIZE = 10000;

// Cleanup interval tracking
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Clean up expired entries and enforce max size
 */
function cleanupRateLimitStore() {
  const now = Date.now();
  const expiredKeys: string[] = [];

  // First pass: identify and remove expired entries
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      expiredKeys.push(key);
    }
  }

  for (const key of expiredKeys) {
    rateLimitStore.delete(key);
  }

  // Second pass: if still over limit, remove oldest entries by lastAccess
  if (rateLimitStore.size > MAX_STORE_SIZE) {
    const entries = Array.from(rateLimitStore.entries());
    // Sort by lastAccess (oldest first)
    entries.sort((a, b) => a[1].lastAccess - b[1].lastAccess);

    // Remove oldest entries until we're under the limit
    const toRemove = rateLimitStore.size - MAX_STORE_SIZE;
    for (let i = 0; i < toRemove && i < entries.length; i++) {
      rateLimitStore.delete(entries[i][0]);
    }

    logger.warn('Rate limit store exceeded max size, evicted old entries', {
      evicted: toRemove,
      remaining: rateLimitStore.size,
    });
  }

  logger.debug('Rate limit store cleanup', {
    expired: expiredKeys.length,
    remaining: rateLimitStore.size,
  });
}

// Start cleanup interval (only in server environment)
if (typeof setInterval !== 'undefined' && !cleanupInterval) {
  cleanupInterval = setInterval(cleanupRateLimitStore, 5 * 60 * 1000);
  // Prevent interval from keeping process alive
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }
}

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

// Default rate limits per endpoint type
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  upload: { maxRequests: 10, windowMs: 60 * 1000 }, // 10 uploads per minute
  process: { maxRequests: 5, windowMs: 60 * 1000 }, // 5 processing requests per minute
  googleDrive: { maxRequests: 20, windowMs: 60 * 1000 }, // 20 Google Drive operations per minute
  default: { maxRequests: 100, windowMs: 60 * 1000 }, // 100 requests per minute for other endpoints
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(
  identifier: string,
  endpoint: string = 'default'
): RateLimitResult {
  const config = RATE_LIMITS[endpoint] || RATE_LIMITS.default;
  const key = `${endpoint}:${identifier}`;
  const now = Date.now();

  let entry = rateLimitStore.get(key);

  // Create or reset entry if expired
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + config.windowMs, lastAccess: now };
    rateLimitStore.set(key, entry);
  }

  // Update last access time
  entry.lastAccess = now;

  // Increment count
  entry.count++;

  const allowed = entry.count <= config.maxRequests;
  const remaining = Math.max(0, config.maxRequests - entry.count);

  if (!allowed) {
    logger.warn('Rate limit exceeded', {
      identifier,
      endpoint,
      count: entry.count,
      limit: config.maxRequests,
    });
  }

  // Proactively clean if approaching limit
  if (rateLimitStore.size > MAX_STORE_SIZE * 0.9) {
    // Schedule cleanup for next tick to avoid blocking current request
    setImmediate(cleanupRateLimitStore);
  }

  return { allowed, remaining, resetAt: entry.resetAt };
}

export function rateLimitResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests. Please try again later.' },
    {
      status: 429,
      headers: {
        'X-RateLimit-Remaining': result.remaining.toString(),
        'X-RateLimit-Reset': new Date(result.resetAt).toISOString(),
        'Retry-After': Math.ceil((result.resetAt - Date.now()) / 1000).toString(),
      },
    }
  );
}

// Helper to get identifier from request (user ID or IP)
export function getRateLimitIdentifier(
  userId: string | null,
  request: Request
): string {
  if (userId) {
    return `user:${userId}`;
  }

  // Fall back to IP address
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown';
  return `ip:${ip}`;
}
