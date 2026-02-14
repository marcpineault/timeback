'use client';

import { useEffect, useRef, useState, useMemo } from 'react';

interface VideoPreviewProps {
  videoUrl: string;
  videoName: string;
  onClose: () => void;
}

export default function VideoPreview({ videoUrl, videoName, onClose }: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Add cache-busting to prevent stale video content on mobile
  const cacheBustedUrl = useMemo(() => {
    // Don't add cache-busting to blob URLs
    if (videoUrl.startsWith('blob:')) return videoUrl;

    const separator = videoUrl.includes('?') ? '&' : '?';
    return `${videoUrl}${separator}_t=${Date.now()}_r=${retryCount}`;
  }, [videoUrl, retryCount]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === modalRef.current) {
      onClose();
    }
  };

  const handleRetry = () => {
    setError(null);
    setIsLoading(true);
    setRetryCount((prev) => prev + 1);
  };

  const handleError = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    setIsLoading(false);
    const video = e.currentTarget;
    const mediaError = video.error;

    if (mediaError) {
      switch (mediaError.code) {
        case MediaError.MEDIA_ERR_ABORTED:
          setError('Video loading was aborted');
          break;
        case MediaError.MEDIA_ERR_NETWORK:
          setError('Network error while loading video. Check your connection.');
          break;
        case MediaError.MEDIA_ERR_DECODE:
          setError('Video format is not supported');
          break;
        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
          setError('Video source not found or not supported');
          break;
        default:
          setError('An error occurred while loading the video');
      }
    } else {
      setError('An error occurred while loading the video');
    }
  };

  return (
    <div
      ref={modalRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm pt-safe"
    >
      <div className="relative w-full max-w-4xl mx-2 sm:mx-4 max-h-full overflow-hidden">
        {/* Video container */}
        <div className="bg-gray-900 rounded-2xl overflow-hidden shadow-2xl">
          {/* Video title bar with close button */}
          <div className="px-3 sm:px-4 py-3 bg-white border border-[#e0dbd4] border-b border-[#e0dbd4] flex items-center justify-between gap-3">
            <h3 className="text-[#0a0a0a] font-medium truncate text-sm sm:text-base">{videoName}</h3>
            <button
              onClick={onClose}
              className="p-2 -mr-2 text-[#8a8580] hover:text-[#0a0a0a] active:scale-95 transition-all flex-shrink-0"
              aria-label="Close preview"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Video player */}
          <div className="relative bg-black aspect-video">
            {isLoading && !error && (
              <div className="absolute inset-0 flex items-center justify-center">
                <svg className="w-8 h-8 text-[#8a8580] animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            )}
            {error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                <svg className="w-12 h-12 text-red-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-red-400 font-medium mb-1">Failed to load video</p>
                <p className="text-[#8a8580] text-sm mb-4">{error}</p>
                {retryCount < 3 && (
                  <button
                    onClick={handleRetry}
                    className="px-4 py-2 bg-[#e85d26] hover:bg-[#d14d1a] text-white text-sm rounded-full transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Try Again
                  </button>
                )}
              </div>
            )}
            <video
              key={cacheBustedUrl}
              ref={videoRef}
              src={cacheBustedUrl}
              controls
              autoPlay
              playsInline
              className={`w-full h-full ${error ? 'hidden' : ''}`}
              controlsList="nodownload"
              onLoadedData={() => setIsLoading(false)}
              onError={handleError}
            >
              Your browser does not support the video tag.
            </video>
          </div>

          {/* Footer - simplified for mobile */}
          <div className="px-3 sm:px-4 py-3 bg-white border border-[#e0dbd4] border-t border-[#e0dbd4] flex items-center justify-between gap-2">
            <p className="hidden sm:block text-sm text-[#8a8580]">
              Press <kbd className="px-2 py-0.5 bg-[#e0dbd4] rounded text-xs">Esc</kbd> to close
            </p>
            <p className="sm:hidden text-xs text-[#8a8580]">Tap outside to close</p>
            <button
              onClick={onClose}
              className="px-3 sm:px-4 py-2 bg-[#e0dbd4] hover:bg-[#e0dbd4] active:bg-[#f5f0e8] text-[#0a0a0a] text-sm rounded-full transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
