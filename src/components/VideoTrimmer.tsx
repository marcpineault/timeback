'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface VideoTrimmerProps {
  videoUrl: string;
  videoName: string;
  filename: string;
  onClose: () => void;
  onTrimComplete: (filename: string) => void;
}

export default function VideoTrimmer({
  videoUrl,
  videoName,
  filename,
  onClose,
  onTrimComplete,
}: VideoTrimmerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTrimming, setIsTrimming] = useState(false);
  const [dragging, setDragging] = useState<'start' | 'end' | 'playhead' | null>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isTrimming) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [onClose, isTrimming]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      setEndTime(video.duration);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      // Loop within trimmed section during preview
      if (video.currentTime >= endTime) {
        video.currentTime = startTime;
      }
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
  }, [startTime, endTime]);

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

  const handleTimelineMouseDown = (e: React.MouseEvent, type: 'start' | 'end' | 'playhead') => {
    e.preventDefault();
    setDragging(type);
  };

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (dragging) return;
    const time = getPositionFromEvent(e);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging) return;
      const time = getPositionFromEvent(e);

      if (dragging === 'start') {
        setStartTime(Math.min(time, endTime - 0.5));
      } else if (dragging === 'end') {
        setEndTime(Math.max(time, startTime + 0.5));
      } else if (dragging === 'playhead' && videoRef.current) {
        videoRef.current.currentTime = time;
        setCurrentTime(time);
      }
    };

    const handleMouseUp = () => {
      setDragging(null);
    };

    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, startTime, endTime, getPositionFromEvent]);

  const handlePlayPause = () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
    } else {
      // Start from beginning of trim section if outside
      if (videoRef.current.currentTime < startTime || videoRef.current.currentTime >= endTime) {
        videoRef.current.currentTime = startTime;
      }
      videoRef.current.play();
    }
  };

  const handlePreviewTrim = () => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = startTime;
    videoRef.current.play();
  };

  const handleApplyTrim = async () => {
    if (startTime === 0 && endTime === duration) {
      // No trim needed
      onClose();
      return;
    }

    setIsTrimming(true);

    try {
      const response = await fetch('/api/trim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename,
          startTime,
          endTime,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Trim failed');
      }

      onTrimComplete(data.filename);
    } catch (error) {
      console.error('Trim error:', error);
      alert(error instanceof Error ? error.message : 'Failed to trim video');
    } finally {
      setIsTrimming(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === modalRef.current && !isTrimming) {
      onClose();
    }
  };

  const trimmedDuration = endTime - startTime;
  const startPercent = duration > 0 ? (startTime / duration) * 100 : 0;
  const endPercent = duration > 0 ? (endTime / duration) * 100 : 100;
  const currentPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

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
          disabled={isTrimming}
          className="absolute -top-12 right-0 p-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          aria-label="Close trimmer"
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="bg-gray-900 rounded-xl overflow-hidden shadow-2xl">
          {/* Header */}
          <div className="px-4 py-3 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="text-white font-medium truncate">Review & Trim: {videoName}</h3>
            </div>
            <div className="text-sm text-gray-400">
              Duration: {formatTime(trimmedDuration)}
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
              <span className="text-blue-400">
                Trim: {formatTime(startTime)} - {formatTime(endTime)}
              </span>
              <span>{formatTime(duration)}</span>
            </div>

            {/* Timeline */}
            <div
              ref={timelineRef}
              className="relative h-12 bg-gray-700 rounded-lg cursor-pointer overflow-hidden"
              onClick={handleTimelineClick}
            >
              {/* Trim region overlay (dimmed areas outside selection) */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-black/60"
                style={{ width: `${startPercent}%` }}
              />
              <div
                className="absolute top-0 bottom-0 right-0 bg-black/60"
                style={{ width: `${100 - endPercent}%` }}
              />

              {/* Selected trim region */}
              <div
                className="absolute top-0 bottom-0 bg-blue-500/20 border-y-2 border-blue-500"
                style={{
                  left: `${startPercent}%`,
                  width: `${endPercent - startPercent}%`,
                }}
              />

              {/* Start handle */}
              <div
                className="absolute top-0 bottom-0 w-4 bg-blue-500 cursor-ew-resize flex items-center justify-center hover:bg-blue-400 transition-colors z-10"
                style={{ left: `calc(${startPercent}% - 8px)` }}
                onMouseDown={(e) => handleTimelineMouseDown(e, 'start')}
              >
                <div className="w-0.5 h-6 bg-white/70 rounded" />
              </div>

              {/* End handle */}
              <div
                className="absolute top-0 bottom-0 w-4 bg-blue-500 cursor-ew-resize flex items-center justify-center hover:bg-blue-400 transition-colors z-10"
                style={{ left: `calc(${endPercent}% - 8px)` }}
                onMouseDown={(e) => handleTimelineMouseDown(e, 'end')}
              >
                <div className="w-0.5 h-6 bg-white/70 rounded" />
              </div>

              {/* Playhead */}
              <div
                className="absolute top-0 bottom-0 w-1 bg-white cursor-ew-resize z-20"
                style={{ left: `calc(${currentPercent}% - 2px)` }}
                onMouseDown={(e) => handleTimelineMouseDown(e, 'playhead')}
              >
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full" />
              </div>
            </div>

            {/* Instructions */}
            <p className="text-xs text-gray-500 mt-2 text-center">
              Drag the blue handles to set trim points. Click anywhere on the timeline to seek.
            </p>
          </div>

          {/* Footer Actions */}
          <div className="px-4 py-4 bg-gray-800 border-t border-gray-700 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={handlePreviewTrim}
                disabled={isTrimming}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Preview Selection
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                disabled={isTrimming}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyTrim}
                disabled={isTrimming}
                className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {isTrimming ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Trimming...
                  </>
                ) : startTime === 0 && endTime === duration ? (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Looks Good
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
                    </svg>
                    Apply Trim
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
