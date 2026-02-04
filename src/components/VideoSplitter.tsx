'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface SplitPart {
  partNumber: number;
  filename: string;
  downloadUrl: string;
}

interface VideoSplitterProps {
  videoUrl: string;
  videoName: string;
  filename: string;
  onClose: () => void;
  onSplitComplete: (parts: SplitPart[]) => void;
}

export default function VideoSplitter({
  videoUrl,
  videoName,
  filename,
  onClose,
  onSplitComplete,
}: VideoSplitterProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [splitPoints, setSplitPoints] = useState<number[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSplitting, setIsSplitting] = useState(false);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSplitting) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [onClose, isSplitting]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, []);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
  };

  const getPositionFromEvent = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!timelineRef.current) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    return percentage * duration;
  }, [duration]);

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (draggingIndex !== null) return;
    const time = getPositionFromEvent(e);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleAddSplitPoint = () => {
    if (currentTime > 0.5 && currentTime < duration - 0.5) {
      // Check if there's already a split point nearby (within 1 second)
      const nearby = splitPoints.some(p => Math.abs(p - currentTime) < 1);
      if (!nearby) {
        setSplitPoints(prev => [...prev, currentTime].sort((a, b) => a - b));
      }
    }
  };

  const handleRemoveSplitPoint = (index: number) => {
    setSplitPoints(prev => prev.filter((_, i) => i !== index));
  };

  const handleSplitPointMouseDown = (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingIndex(index);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (draggingIndex === null) return;
      const time = getPositionFromEvent(e);

      // Keep within bounds and away from other split points
      const minTime = 0.5;
      const maxTime = duration - 0.5;
      const clampedTime = Math.max(minTime, Math.min(maxTime, time));

      setSplitPoints(prev => {
        const newPoints = [...prev];
        newPoints[draggingIndex] = clampedTime;
        return newPoints.sort((a, b) => a - b);
      });
    };

    const handleMouseUp = () => {
      setDraggingIndex(null);
    };

    if (draggingIndex !== null) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingIndex, duration, getPositionFromEvent]);

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
  };

  const handleApplySplit = async () => {
    if (splitPoints.length === 0) {
      onClose();
      return;
    }

    setIsSplitting(true);

    try {
      const response = await fetch('/api/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename,
          splitPoints,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Split failed');
      }

      onSplitComplete(data.parts);
    } catch (error) {
      console.error('Split error:', error);
      alert(error instanceof Error ? error.message : 'Failed to split video');
    } finally {
      setIsSplitting(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === modalRef.current && !isSplitting) {
      onClose();
    }
  };

  // Calculate segments from split points
  const segments = (() => {
    const allPoints = [0, ...splitPoints, duration];
    const segs = [];
    for (let i = 0; i < allPoints.length - 1; i++) {
      segs.push({
        start: allPoints[i],
        end: allPoints[i + 1],
        duration: allPoints[i + 1] - allPoints[i],
      });
    }
    return segs;
  })();

  const currentPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Generate colors for segments
  const segmentColors = [
    'bg-blue-500/30',
    'bg-green-500/30',
    'bg-purple-500/30',
    'bg-amber-500/30',
    'bg-pink-500/30',
    'bg-cyan-500/30',
  ];

  return (
    <div
      ref={modalRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-5xl mx-4">
        {/* Close button */}
        <button
          onClick={onClose}
          disabled={isSplitting}
          className="absolute -top-12 right-0 p-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          aria-label="Close splitter"
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="bg-gray-900 rounded-xl overflow-hidden shadow-2xl">
          {/* Header */}
          <div className="px-4 py-3 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              <h3 className="text-white font-medium truncate">Split Video: {videoName}</h3>
            </div>
            <div className="text-sm text-gray-400">
              {splitPoints.length > 0 ? `${splitPoints.length + 1} parts` : 'No splits yet'}
            </div>
          </div>

          {/* Video Player */}
          <div className="relative bg-black aspect-video">
            <video
              ref={videoRef}
              src={videoUrl}
              className="w-full h-full"
              playsInline
            />

            {/* Play/Pause Overlay */}
            <button
              onClick={handlePlayPause}
              className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/20 transition-colors group"
            >
              <div className="w-16 h-16 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {isPlaying ? (
                  <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                ) : (
                  <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </div>
            </button>
          </div>

          {/* Timeline Controls */}
          <div className="px-4 py-4 bg-gray-800 border-t border-gray-700">
            {/* Time display */}
            <div className="flex justify-between text-sm text-gray-400 mb-3">
              <span>{formatTime(currentTime)}</span>
              <button
                onClick={handleAddSplitPoint}
                disabled={currentTime <= 0.5 || currentTime >= duration - 0.5}
                className="px-3 py-1 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-xs rounded-lg transition-colors flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Split Here
              </button>
              <span>{formatTime(duration)}</span>
            </div>

            {/* Timeline */}
            <div
              ref={timelineRef}
              className="relative h-14 bg-gray-700 rounded-lg cursor-pointer overflow-hidden"
              onClick={handleTimelineClick}
            >
              {/* Segment colors */}
              {segments.map((seg, index) => (
                <div
                  key={index}
                  className={`absolute top-0 bottom-0 ${segmentColors[index % segmentColors.length]} border-r border-gray-600`}
                  style={{
                    left: `${(seg.start / duration) * 100}%`,
                    width: `${(seg.duration / duration) * 100}%`,
                  }}
                >
                  <span className="absolute bottom-1 left-1 text-[10px] text-white/70 font-medium">
                    Part {index + 1}
                  </span>
                </div>
              ))}

              {/* Split point markers */}
              {splitPoints.map((point, index) => (
                <div
                  key={index}
                  className="absolute top-0 bottom-0 w-4 cursor-ew-resize z-10 group"
                  style={{ left: `calc(${(point / duration) * 100}% - 8px)` }}
                  onMouseDown={(e) => handleSplitPointMouseDown(e, index)}
                >
                  {/* Split line */}
                  <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-orange-500 -translate-x-1/2" />
                  {/* Handle */}
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                    </svg>
                  </div>
                  {/* Time label */}
                  <div className="absolute left-1/2 -top-6 -translate-x-1/2 px-1.5 py-0.5 bg-orange-500 text-white text-[10px] rounded whitespace-nowrap">
                    {formatTime(point)}
                  </div>
                  {/* Remove button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveSplitPoint(index);
                    }}
                    className="absolute left-1/2 -bottom-6 -translate-x-1/2 w-4 h-4 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}

              {/* Playhead */}
              <div
                className="absolute top-0 bottom-0 w-1 bg-white z-20 pointer-events-none"
                style={{ left: `calc(${currentPercent}% - 2px)` }}
              >
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full" />
              </div>
            </div>

            {/* Instructions */}
            <p className="text-xs text-gray-500 mt-2 text-center">
              Seek to a position and click &quot;Add Split Here&quot; to mark split points. Drag markers to adjust.
            </p>
          </div>

          {/* Segments Preview */}
          {splitPoints.length > 0 && (
            <div className="px-4 py-3 bg-gray-800/50 border-t border-gray-700">
              <p className="text-xs text-gray-400 mb-2">Resulting segments:</p>
              <div className="flex flex-wrap gap-2">
                {segments.map((seg, index) => (
                  <div
                    key={index}
                    className={`px-3 py-1.5 rounded-lg text-xs text-white ${segmentColors[index % segmentColors.length].replace('/30', '/50')}`}
                  >
                    <span className="font-medium">Part {index + 1}:</span>{' '}
                    {formatTime(seg.start)} - {formatTime(seg.end)} ({formatTime(seg.duration)})
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="px-4 py-4 bg-gray-800 border-t border-gray-700 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-gray-400">
              {splitPoints.length === 0 ? (
                <span>Add split points to divide this video</span>
              ) : (
                <span>Ready to create {splitPoints.length + 1} video parts</span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                disabled={isSplitting}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleApplySplit}
                disabled={isSplitting || splitPoints.length === 0}
                className="px-6 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-600 text-white text-sm rounded-lg font-medium transition-colors flex items-center gap-2 disabled:cursor-not-allowed"
              >
                {isSplitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Splitting...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                    Split Video
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
