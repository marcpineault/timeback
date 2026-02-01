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
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;

/**
 * Fetch with retry logic for network resilience on mobile
 */
async function fetchWithRetry(
  url: string,
  maxRetries: number,
  retryDelayMs: number,
  signal?: AbortSignal
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, { signal });

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
      lastError = err instanceof Error ? err : new Error('Unknown error');

      // Don't retry if aborted
      if (signal?.aborted) {
        throw lastError;
      }

      // Retry network errors
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, retryDelayMs * (attempt + 1)));
        continue;
      }
    }
  }

  throw lastError || new Error('Download failed after retries');
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
   * Download and save a video file
   * - iOS: Opens share sheet for "Save Video" to Camera Roll
   * - Android: Downloads to Downloads folder, with share fallback
   * - Desktop: Standard browser download
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
          controller.signal
        );

        if (!response.ok) {
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
              // Fall through to download fallback
            }
          }
        }

        // Fallback: trigger standard download
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

        const errorMsg =
          platform === 'ios'
            ? 'Download failed. Check your connection and try again.'
            : 'Download failed. Please check your connection and try again.';

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
    [platform, maxRetries, retryDelayMs, cancel, onSuccess, onError]
  );

  return {
    ...state,
    platform,
    downloadVideo,
    cancel,
    reset,
  };
}
