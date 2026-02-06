'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { usePlatform, type Platform } from './usePlatform';

export interface DownloadState {
  isDownloading: boolean;
  progress: number; // 0-100
  error: string | null;
  success: boolean;
}

export interface DownloadOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number; // Timeout per request in milliseconds
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;
// 3 minutes default timeout - generous for mobile on slow connections
const DEFAULT_TIMEOUT_MS = 180000;

/**
 * Fetch with retry logic and per-request timeout for network resilience on mobile
 */
async function fetchWithRetry(
  url: string,
  maxRetries: number,
  retryDelayMs: number,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Create a timeout controller for this attempt
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

    // Combine with the external signal if provided
    const combinedSignal = signal
      ? combineAbortSignals(signal, timeoutController.signal)
      : timeoutController.signal;

    try {
      const response = await fetch(url, { signal: combinedSignal });
      clearTimeout(timeoutId);

      // Don't retry on client errors (4xx) - these won't succeed on retry
      if (response.status >= 400 && response.status < 500) {
        return response;
      }

      // Retry on server errors (5xx)
      if (!response.ok && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, retryDelayMs * (attempt + 1)));
        continue;
      }

      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err instanceof Error ? err : new Error('Unknown error');

      // Check if this was a timeout
      if (timeoutController.signal.aborted && !signal?.aborted) {
        lastError = new Error('Request timed out');
      }

      // Don't retry if externally aborted
      if (signal?.aborted) {
        throw lastError;
      }

      // Retry network errors and timeouts
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, retryDelayMs * (attempt + 1)));
        continue;
      }
    }
  }

  throw lastError || new Error('Download failed after retries');
}

/**
 * Combine multiple AbortSignals into one
 */
function combineAbortSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  return controller.signal;
}

/**
 * Get user-friendly error message based on response status
 */
function getErrorMessage(status: number, platform: Platform): string {
  switch (status) {
    case 404:
      return 'Video file not found. It may have expired.';
    case 401:
    case 403:
      return 'Access denied. Please refresh the page and try again.';
    case 500:
    case 502:
    case 503:
      return 'Server error. Please try again in a moment.';
    default:
      return platform === 'ios'
        ? 'Download failed. Check your connection and try again.'
        : `Download failed (error ${status}). Please try again.`;
  }
}

/**
 * Hook for consistent download handling across platforms with retry logic.
 * Handles iOS Camera Roll saves, Android downloads, and desktop downloads.
 */
export function useDownload(options: DownloadOptions = {}) {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    onSuccess,
    onError,
  } = options;

  const platform = usePlatform();
  const abortControllerRef = useRef<AbortController | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const [state, setState] = useState<DownloadState>({
    isDownloading: false,
    progress: 0,
    error: null,
    success: false,
  });

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  /**
   * Cancel any ongoing download
   */
  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setState((prev) => ({ ...prev, isDownloading: false }));
  }, []);

  /**
   * Reset the download state
   */
  const reset = useCallback(() => {
    cancel();
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setState({
      isDownloading: false,
      progress: 0,
      error: null,
      success: false,
    });
  }, [cancel]);

  /**
   * Fallback: trigger a direct browser navigation to the download URL.
   * This bypasses fetch/CORS/memory issues by letting the browser handle
   * the download natively (including following redirects to presigned S3/R2 URLs).
   */
  const triggerDirectDownload = useCallback(
    (url: string, filename: string) => {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      // Use target=_blank on iOS where the download attribute is often ignored,
      // so the browser opens the URL and the user can long-press to save.
      if (platform === 'ios') {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      }
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    },
    [platform]
  );

  /**
   * Download and save a video file
   * - iOS: Opens share sheet for "Save Video" to Camera Roll
   * - Android: Downloads to Downloads folder, with share fallback
   * - Desktop: Standard browser download
   * - Mobile fallback: Direct URL navigation if blob fetch or share fails
   */
  const downloadVideo = useCallback(
    async (url: string, filename: string) => {
      // Cancel any existing download
      cancel();

      // Clean up any previous blob URL
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }

      setState({
        isDownloading: true,
        progress: 0,
        error: null,
        success: false,
      });

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        // Add cache-busting timestamp to prevent stale responses
        const cacheBustedUrl = url.includes('?')
          ? `${url}&_t=${Date.now()}`
          : `${url}?_t=${Date.now()}`;

        const response = await fetchWithRetry(
          cacheBustedUrl,
          maxRetries,
          retryDelayMs,
          timeoutMs,
          controller.signal
        );

        if (!response.ok) {
          // On mobile, fall back to direct download instead of showing an error
          // This handles cases where fetch fails due to CORS on presigned URL redirects
          if (platform !== 'desktop') {
            triggerDirectDownload(url, filename);
            setState({
              isDownloading: false,
              progress: 100,
              error: null,
              success: true,
            });
            onSuccess?.();
            return;
          }
          const errorMsg = getErrorMessage(response.status, platform);
          setState((prev) => ({ ...prev, isDownloading: false, error: errorMsg }));
          onError?.(errorMsg);
          return;
        }

        setState((prev) => ({ ...prev, progress: 30 }));

        const blob = await response.blob();

        setState((prev) => ({ ...prev, progress: 60 }));

        // Try Web Share API first for mobile (iOS Camera Roll, Android share)
        if (platform !== 'desktop') {
          const file = new File([blob], filename, { type: 'video/mp4' });

          if (
            navigator.share &&
            navigator.canShare &&
            navigator.canShare({ files: [file] })
          ) {
            try {
              await navigator.share({
                files: [file],
                title: 'Save Video',
              });
              setState({
                isDownloading: false,
                progress: 100,
                error: null,
                success: true,
              });
              onSuccess?.();
              return;
            } catch (err) {
              // User cancelled share - not an error
              if (err instanceof Error && err.name === 'AbortError') {
                setState((prev) => ({ ...prev, isDownloading: false }));
                return;
              }
              // Share failed (not cancelled) - fall back to direct download
              triggerDirectDownload(url, filename);
              setState({
                isDownloading: false,
                progress: 100,
                error: null,
                success: true,
              });
              onSuccess?.();
              return;
            }
          }

          // Web Share API not available on this mobile browser - use direct download
          triggerDirectDownload(url, filename);
          setState({
            isDownloading: false,
            progress: 100,
            error: null,
            success: true,
          });
          onSuccess?.();
          return;
        }

        // Desktop: trigger standard blob download
        const blobUrl = URL.createObjectURL(blob);
        blobUrlRef.current = blobUrl;

        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Revoke after a delay to ensure download started
        setTimeout(() => {
          if (blobUrlRef.current === blobUrl) {
            URL.revokeObjectURL(blobUrl);
            blobUrlRef.current = null;
          }
        }, 1000);

        setState({
          isDownloading: false,
          progress: 100,
          error: null,
          success: true,
        });
        onSuccess?.();
      } catch (err) {
        // Handle abort
        if (err instanceof Error && err.name === 'AbortError') {
          setState((prev) => ({ ...prev, isDownloading: false }));
          return;
        }

        // On mobile, fall back to direct URL download instead of showing an error.
        // This handles blob memory exhaustion, CORS failures on redirected
        // presigned URLs, and other fetch-level failures that don't occur
        // when the browser navigates to the URL natively.
        if (platform !== 'desktop') {
          triggerDirectDownload(url, filename);
          setState({
            isDownloading: false,
            progress: 100,
            error: null,
            success: true,
          });
          onSuccess?.();
          return;
        }

        const errorMsg = 'Download failed. Please check your connection and try again.';

        setState({
          isDownloading: false,
          progress: 0,
          error: errorMsg,
          success: false,
        });
        onError?.(errorMsg);
      } finally {
        abortControllerRef.current = null;
      }
    },
    [platform, maxRetries, retryDelayMs, timeoutMs, cancel, triggerDirectDownload, onSuccess, onError]
  );

  return {
    ...state,
    platform,
    downloadVideo,
    cancel,
    reset,
  };
}
