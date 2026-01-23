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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-4xl mx-4">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 p-2 text-gray-400 hover:text-white transition-colors"
          aria-label="Close preview"
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Video container */}
        <div className="bg-gray-900 rounded-xl overflow-hidden shadow-2xl">
          {/* Video title */}
          <div className="px-4 py-3 bg-gray-800 border-b border-gray-700">
            <h3 className="text-white font-medium truncate">{videoName}</h3>
          </div>

          {/* Video player */}
          <div className="relative bg-black aspect-video">
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              autoPlay
              className="w-full h-full"
              controlsList="nodownload"
            >
              Your browser does not support the video tag.
            </video>
          </div>

          {/* Footer with info */}
          <div className="px-4 py-3 bg-gray-800 border-t border-gray-700 flex items-center justify-between">
            <p className="text-sm text-gray-400">
              Press <kbd className="px-2 py-0.5 bg-gray-700 rounded text-xs">Esc</kbd> or click outside to close
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
            >
              Close Preview
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
