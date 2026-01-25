'use client';

import { useEffect, useRef } from 'react';

interface VideoPreviewProps {
  videoUrl: string;
  videoName: string;
  onClose: () => void;
}

export default function VideoPreview({ videoUrl, videoName, onClose }: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

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

  return (
    <div
      ref={modalRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm pt-safe"
    >
      <div className="relative w-full max-w-4xl mx-2 sm:mx-4 max-h-full overflow-hidden">
        {/* Video container */}
        <div className="bg-gray-900 rounded-xl overflow-hidden shadow-2xl">
          {/* Video title bar with close button */}
          <div className="px-3 sm:px-4 py-3 bg-gray-800 border-b border-gray-700 flex items-center justify-between gap-3">
            <h3 className="text-white font-medium truncate text-sm sm:text-base">{videoName}</h3>
            <button
              onClick={onClose}
              className="p-2 -mr-2 text-gray-400 hover:text-white active:scale-95 transition-all flex-shrink-0"
              aria-label="Close preview"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Video player */}
          <div className="relative bg-black aspect-video">
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              autoPlay
              playsInline
              className="w-full h-full"
              controlsList="nodownload"
            >
              Your browser does not support the video tag.
            </video>
          </div>

          {/* Footer - simplified for mobile */}
          <div className="px-3 sm:px-4 py-3 bg-gray-800 border-t border-gray-700 flex items-center justify-between gap-2">
            <p className="hidden sm:block text-sm text-gray-400">
              Press <kbd className="px-2 py-0.5 bg-gray-700 rounded text-xs">Esc</kbd> to close
            </p>
            <p className="sm:hidden text-xs text-gray-500">Tap outside to close</p>
            <button
              onClick={onClose}
              className="px-3 sm:px-4 py-2 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-white text-sm rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
