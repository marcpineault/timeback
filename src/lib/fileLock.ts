import { logger } from './logger';

/**
 * In-memory file lock manager to prevent cleanup of files being processed.
 * Uses a Set to track locked file paths with automatic expiration.
 */

interface LockInfo {
  lockedAt: number;
  expiresAt: number;
}

// In-memory store of locked files with their expiration times
const lockedFiles = new Map<string, LockInfo>();

// Default lock duration: 30 minutes (should be longer than max processing time)
const DEFAULT_LOCK_DURATION_MS = 30 * 60 * 1000;

/**
 * Acquire a lock on a file to prevent it from being cleaned up during processing.
 * @param filePath - The absolute path to the file to lock
 * @param durationMs - How long to hold the lock (default: 30 minutes)
 * @returns true if lock was acquired
 */
export function acquireFileLock(filePath: string, durationMs: number = DEFAULT_LOCK_DURATION_MS): boolean {
  const now = Date.now();

  // Clean up any expired locks first
  cleanupExpiredLocks();

  // Check if already locked by another process
  const existing = lockedFiles.get(filePath);
  if (existing && existing.expiresAt > now) {
    // Already locked and not expired - extend the lock
    existing.expiresAt = now + durationMs;
    logger.debug('Extended file lock', { filePath, expiresAt: new Date(existing.expiresAt).toISOString() });
    return true;
  }

  // Acquire new lock
  lockedFiles.set(filePath, {
    lockedAt: now,
    expiresAt: now + durationMs,
  });

  logger.debug('Acquired file lock', { filePath, durationMs });
  return true;
}

/**
 * Release a lock on a file.
 * @param filePath - The absolute path to the file to unlock
 */
export function releaseFileLock(filePath: string): void {
  if (lockedFiles.delete(filePath)) {
    logger.debug('Released file lock', { filePath });
  }
}

/**
 * Check if a file is currently locked.
 * @param filePath - The absolute path to check
 * @returns true if the file is locked and the lock hasn't expired
 */
export function isFileLocked(filePath: string): boolean {
  const lock = lockedFiles.get(filePath);
  if (!lock) return false;

  const now = Date.now();
  if (lock.expiresAt <= now) {
    // Lock has expired, remove it
    lockedFiles.delete(filePath);
    return false;
  }

  return true;
}

/**
 * Lock multiple files at once (useful for locking input and intermediate files).
 * @param filePaths - Array of file paths to lock
 * @param durationMs - How long to hold the locks
 */
export function acquireFileLocks(filePaths: string[], durationMs: number = DEFAULT_LOCK_DURATION_MS): void {
  for (const filePath of filePaths) {
    acquireFileLock(filePath, durationMs);
  }
}

/**
 * Release multiple file locks at once.
 * @param filePaths - Array of file paths to unlock
 */
export function releaseFileLocks(filePaths: string[]): void {
  for (const filePath of filePaths) {
    releaseFileLock(filePath);
  }
}

/**
 * Clean up expired locks from memory.
 */
function cleanupExpiredLocks(): void {
  const now = Date.now();
  for (const [filePath, lock] of lockedFiles.entries()) {
    if (lock.expiresAt <= now) {
      lockedFiles.delete(filePath);
      logger.debug('Removed expired file lock', { filePath });
    }
  }
}

/**
 * Get count of currently active locks (for debugging/monitoring).
 */
export function getActiveLockCount(): number {
  cleanupExpiredLocks();
  return lockedFiles.size;
}
