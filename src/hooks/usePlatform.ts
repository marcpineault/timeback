'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';

export type Platform = 'ios' | 'android' | 'desktop';

// Server-side safe platform detection
function getServerSnapshot(): Platform {
  return 'desktop';
}

// Client-side platform detection - runs synchronously
function getClientSnapshot(): Platform {
  if (typeof navigator === 'undefined') return 'desktop';

  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

// Subscribe function (platform never changes after mount)
function subscribe(): () => void {
  return () => {};
}

/**
 * Hook for consistent platform detection across components.
 * Uses useSyncExternalStore to avoid hydration mismatches and race conditions.
 *
 * Returns:
 * - 'ios': iPhone, iPad, or iPod
 * - 'android': Android devices
 * - 'desktop': Everything else
 */
export function usePlatform(): Platform {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}

/**
 * Check if Web Share API with file sharing is available.
 * This varies between browsers and devices.
 */
export function useCanShareFiles(): boolean {
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'share' in navigator && 'canShare' in navigator) {
      // Test with a minimal file to check support
      const testFile = new File([''], 'test.txt', { type: 'text/plain' });
      try {
        const result = navigator.canShare({ files: [testFile] });
        setCanShare(result);
      } catch {
        setCanShare(false);
      }
    }
  }, []);

  return canShare;
}

/**
 * Check if the device is mobile (iOS or Android)
 */
export function useIsMobile(): boolean {
  const platform = usePlatform();
  return platform === 'ios' || platform === 'android';
}
