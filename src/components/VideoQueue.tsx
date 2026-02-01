'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { UploadedFile } from './VideoUploader';
import { usePlatform } from '@/hooks/usePlatform';

export interface QueuedVideo {
  file: UploadedFile;
  status: 'pending' | 'processing' | 'complete' | 'error';
  error?: string;
  downloadUrl?: string;
  outputFilename?: string;
}

interface VideoQueueProps {
  videos: QueuedVideo[];
  onRemove: (fileId: string) => void;
  onClear: () => void;
  onPreview?: (video: QueuedVideo) => void;
  onRetry?: (fileId: string) => void;
  onEdit?: (video: QueuedVideo) => void;
}

export default function VideoQueue({ videos, onRemove, onClear, onPreview, onRetry, onEdit }: VideoQueueProps) {
  const platform = usePlatform();
  const [savingVideoId, setSavingVideoId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  const saveToDevice = useCallback(async (video: QueuedVideo) => {
    if (!video.downloadUrl || !video.outputFilename) return;

    // Cleanup previous blob URL
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    setSavingVideoId(video.file.fileId);
    setSaveError(null);

    try {
      // Add cache-busting to prevent stale responses
      const cacheBustedUrl = video.downloadUrl.includes('?')
        ? `${video.downloadUrl}&_t=${Date.now()}`
        : `${video.downloadUrl}?_t=${Date.now()}`;

      // Fetch with retry logic and timeout for mobile reliability
      // 3 minute timeout per attempt - generous for slow mobile connections
      const TIMEOUT_MS = 180000;
      let response: Response | null = null;

      for (let attempt = 0; attempt < 3; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        try {
          response = await fetch(cacheBustedUrl, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (response.ok) break;

          // Don't retry client errors
          if (response.status >= 400 && response.status < 500) break;

          // Wait before retry (exponential backoff)
          if (attempt < 2) {
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          }
        } catch (err) {
          clearTimeout(timeoutId);
          // Don't retry if it's a timeout on the last attempt
          if (attempt < 2) {
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          }
        }
      }

      if (!response || !response.ok) {
        console.error('Download failed:', response?.status, response?.statusText);
        setSaveError('Download failed. Please try again.');
        return;
      }

      const blob = await response.blob();
      const file = new File([blob], video.outputFilename, { type: 'video/mp4' });

      // Mobile (iOS/Android): Use Web Share API to open share sheet
      if ((platform === 'ios' || platform === 'android') && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: 'Save Video',
          });
          return;
        } catch (err) {
          // User cancelled is not an error
          if (err instanceof Error && err.name === 'AbortError') {
            return;
          }
          // Fall through to download fallback
        }
      }

      // Desktop/fallback: Trigger download
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;

      const a = document.createElement('a');
      a.href = url;
      a.download = video.outputFilename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Cleanup after delay
      setTimeout(() => {
        if (blobUrlRef.current === url) {
          URL.revokeObjectURL(url);
          blobUrlRef.current = null;
        }
      }, 1000);
    } catch (err) {
      // User cancelled is not an error
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Save failed:', err);
        setSaveError('Save failed. Please try again.');
      }
    } finally {
      setSavingVideoId(null);
    }
  }, [platform]);

  if (videos.length === 0) return null;

  const completedCount = videos.filter(v => v.status === 'complete').length;
  const processingCount = videos.filter(v => v.status === 'processing').length;
  const pendingCount = videos.filter(v => v.status === 'pending').length;
  const errorCount = videos.filter(v => v.status === 'error').length;

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusBadge = (status: QueuedVideo['status']) => {
    switch (status) {
      case 'pending':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-600 text-gray-300">Pending</span>;
      case 'processing':
        return (
          <span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/20 text-blue-400 flex items-center gap-1">
            <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            Processing
          </span>
        );
      case 'complete':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-green-500/20 text-green-400">Complete</span>;
      case 'error':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-red-500/20 text-red-400">Error</span>;
    }
  };

  return (
    <div className="bg-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-3 sm:px-4 py-3 bg-gray-700/50 flex justify-between items-center">
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
          <h3 className="font-medium text-white text-sm sm:text-base">Video Queue ({videos.length})</h3>
          <div className="hidden sm:flex items-center gap-2 text-xs text-gray-400">
            {completedCount > 0 && <span className="text-green-400">{completedCount} complete</span>}
            {processingCount > 0 && <span className="text-blue-400">{processingCount} processing</span>}
            {pendingCount > 0 && <span>{pendingCount} pending</span>}
            {errorCount > 0 && <span className="text-red-400">{errorCount} failed</span>}
          </div>
        </div>
        <button
          onClick={onClear}
          className="text-xs sm:text-sm text-gray-400 hover:text-white transition-colors"
        >
          Clear
        </button>
      </div>

      {/* Save error message */}
      {saveError && (
        <div className="px-3 sm:px-4 py-2 bg-red-500/10 border-b border-red-500/20">
          <p className="text-xs text-red-400">{saveError}</p>
        </div>
      )}

      {/* Video List */}
      <div className="divide-y divide-gray-700/50 max-h-80 overflow-y-auto">
        {videos.map((video) => (
          <div
            key={video.file.fileId}
            className={`px-3 sm:px-4 py-3 flex items-center gap-2 sm:gap-4 ${
              video.status === 'processing' ? 'bg-blue-500/5' : ''
            }`}
          >
            {/* Thumbnail - hidden on mobile */}
            <button
              onClick={() => video.file.previewUrl && onPreview?.(video)}
              disabled={!video.file.previewUrl}
              className={`hidden sm:flex w-12 h-12 bg-gray-700 rounded-lg items-center justify-center flex-shrink-0 relative group transition-all ${
                video.file.previewUrl ? 'hover:bg-gray-600 cursor-pointer' : 'cursor-default'
              }`}
              title={video.file.previewUrl ? 'Click to preview' : 'Preview not available'}
            >
              <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {video.file.previewUrl && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              )}
            </button>

            {/* File Info */}
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm text-white truncate">{video.file.originalName}</p>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>{formatFileSize(video.file.size)}</span>
                <span className="sm:hidden">{getStatusBadge(video.status)}</span>
              </div>
              {video.error && <p className="text-xs text-red-400 truncate">{video.error}</p>}
            </div>

            {/* Status - hidden on mobile (shown inline above) */}
            <div className="hidden sm:flex items-center gap-3">
              {getStatusBadge(video.status)}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 sm:gap-3">
              {/* Preview button for completed videos */}
              {video.status === 'complete' && video.downloadUrl && onPreview && (
                <button
                  onClick={() => onPreview(video)}
                  className="p-1.5 sm:p-2 text-gray-400 hover:text-white transition-colors"
                  title="Preview"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </button>
              )}


              {/* Save/Download button for completed */}
              {video.status === 'complete' && video.downloadUrl && (
                <button
                  onClick={() => saveToDevice(video)}
                  disabled={savingVideoId === video.file.fileId}
                  className="p-1.5 sm:p-2 text-blue-400 hover:text-blue-300 disabled:text-blue-400/50 transition-colors"
                  title={platform === 'ios' || platform === 'android' ? 'Save to Camera Roll' : 'Download'}
                >
                  {savingVideoId === video.file.fileId ? (
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (platform === 'ios' || platform === 'android') ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  )}
                </button>
              )}

              {/* Retry button for failed */}
              {video.status === 'error' && onRetry && (
                <button
                  onClick={() => onRetry(video.file.fileId)}
                  className="p-1.5 sm:p-2 text-amber-400 hover:text-amber-300 transition-colors"
                  title="Retry"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              )}

              {/* Remove button */}
              {video.status !== 'processing' && (
                <button
                  onClick={() => onRemove(video.file.fileId)}
                  className="p-1.5 sm:p-2 text-gray-500 hover:text-red-400 transition-colors"
                  title="Remove"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
