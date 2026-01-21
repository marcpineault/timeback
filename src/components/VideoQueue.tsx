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
}

export default function VideoQueue({ videos, onRemove, onClear }: VideoQueueProps) {
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
      <div className="px-4 py-3 bg-gray-700/50 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h3 className="font-medium text-white">Video Queue</h3>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            {completedCount > 0 && <span className="text-green-400">{completedCount} complete</span>}
            {processingCount > 0 && <span className="text-blue-400">{processingCount} processing</span>}
            {pendingCount > 0 && <span>{pendingCount} pending</span>}
            {errorCount > 0 && <span className="text-red-400">{errorCount} failed</span>}
          </div>
        </div>
        <button
          onClick={onClear}
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          Clear All
        </button>
      </div>

      {/* Video List */}
      <div className="divide-y divide-gray-700/50 max-h-80 overflow-y-auto">
        {videos.map((video) => (
          <div
            key={video.file.fileId}
            className={`px-4 py-3 flex items-center gap-4 ${
              video.status === 'processing' ? 'bg-blue-500/5' : ''
            }`}
          >
            {/* Thumbnail placeholder */}
            <div className="w-12 h-12 bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>

            {/* File Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{video.file.originalName}</p>
              <p className="text-xs text-gray-500">
                {video.error || formatFileSize(video.file.size)}
              </p>
            </div>

            {/* Status */}
            <div className="flex items-center gap-3">
              {getStatusBadge(video.status)}

              {/* Download button for completed */}
              {video.status === 'complete' && video.downloadUrl && (
                <a
                  href={video.downloadUrl}
                  download={video.outputFilename}
                  className="p-2 text-blue-400 hover:text-blue-300 transition-colors"
                  title="Download"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </a>
              )}

              {/* Remove button */}
              {video.status !== 'processing' && (
                <button
                  onClick={() => onRemove(video.file.fileId)}
                  className="p-2 text-gray-500 hover:text-red-400 transition-colors"
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
