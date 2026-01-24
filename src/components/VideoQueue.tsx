'use client';

import { UploadedFile } from './VideoUploader';

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
  onTrim?: (video: QueuedVideo) => void;
  onSplit?: (video: QueuedVideo) => void;
}

export default function VideoQueue({ videos, onRemove, onClear, onPreview, onRetry, onTrim, onSplit }: VideoQueueProps) {
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

              {/* Trim button for completed */}
              {video.status === 'complete' && video.downloadUrl && onTrim && (
                <button
                  onClick={() => onTrim(video)}
                  className="p-1.5 sm:p-2 text-purple-400 hover:text-purple-300 transition-colors"
                  title="Trim"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
                  </svg>
                </button>
              )}

              {/* Split button for completed */}
              {video.status === 'complete' && video.downloadUrl && onSplit && (
                <button
                  onClick={() => onSplit(video)}
                  className="p-1.5 sm:p-2 text-orange-400 hover:text-orange-300 transition-colors"
                  title="Split"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                </button>
              )}

              {/* Download button for completed */}
              {video.status === 'complete' && video.downloadUrl && (
                <a
                  href={video.downloadUrl}
                  download={video.outputFilename}
                  className="p-1.5 sm:p-2 text-blue-400 hover:text-blue-300 transition-colors"
                  title="Download"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </a>
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
