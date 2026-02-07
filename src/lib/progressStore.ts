/**
 * In-memory progress tracking for video processing.
 * Stores per-video progress so the frontend can poll for updates.
 *
 * Progress entries auto-expire after 15 minutes to prevent memory leaks.
 */

export interface ProcessingProgress {
  /** Current step number (1-based) */
  step: number;
  /** Total number of steps for this video */
  totalSteps: number;
  /** Human-readable label for the current step */
  stepLabel: string;
  /** Timestamp of last update */
  updatedAt: number;
}

const store = new Map<string, ProcessingProgress>();

const EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Update progress for a video being processed.
 * @param fileId - The unique file identifier
 */
export function setProgress(fileId: string, progress: Omit<ProcessingProgress, 'updatedAt'>): void {
  store.set(fileId, { ...progress, updatedAt: Date.now() });
}

/**
 * Get current progress for a video. Returns null if not found or expired.
 */
export function getProgress(fileId: string): ProcessingProgress | null {
  const entry = store.get(fileId);
  if (!entry) return null;

  // Auto-expire stale entries
  if (Date.now() - entry.updatedAt > EXPIRY_MS) {
    store.delete(fileId);
    return null;
  }

  return entry;
}

/**
 * Remove progress entry when processing completes or fails.
 */
export function clearProgress(fileId: string): void {
  store.delete(fileId);
}

/**
 * Periodic cleanup of expired entries (called opportunistically).
 */
export function cleanupExpiredProgress(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.updatedAt > EXPIRY_MS) {
      store.delete(key);
    }
  }
}
