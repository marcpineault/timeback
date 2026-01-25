'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface Segment {
  id: string;
  start: number;
  end: number;
  deleted: boolean;
}

interface MediaEditorProps {
  videoUrl: string;
  videoName: string;
  filename: string;
  onClose: () => void;
  onComplete?: (filename: string, stats: { sectionsRemoved: number; timeRemoved: number }) => void;
}

export default function MediaEditor({
  videoUrl,
  videoName,
  filename,
  onClose,
  onComplete,
}: MediaEditorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Core state
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Segments state - video divided by split points
  const [segments, setSegments] = useState<Segment[]>([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);

  // Timeline state
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [isScrubbingTimeline, setIsScrubbingTimeline] = useState(false);

  // Initialize with single segment when duration is known
  useEffect(() => {
    if (duration > 0 && segments.length === 0) {
      setSegments([{ id: '0', start: 0, end: duration, deleted: false }]);
    }
  }, [duration, segments.length]);

  // Generate video thumbnails
  useEffect(() => {
    if (duration === 0 || thumbnails.length > 0) return;

    const thumbVideo = document.createElement('video');
    thumbVideo.src = videoUrl;
    thumbVideo.crossOrigin = 'anonymous';
    thumbVideo.muted = true;
    thumbVideo.preload = 'metadata';

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const thumbWidth = 80;
    const thumbHeight = 60;
    canvas.width = thumbWidth;
    canvas.height = thumbHeight;

    const numThumbs = Math.min(20, Math.ceil(duration / 2));
    const interval = duration / numThumbs;
    const thumbs: string[] = [];
    let currentThumb = 0;
    let isActive = true;

    const captureFrame = () => {
      if (!isActive) return;
      if (currentThumb >= numThumbs) {
        setThumbnails(thumbs);
        thumbVideo.remove();
        return;
      }
      thumbVideo.currentTime = currentThumb * interval;
    };

    const handleSeeked = () => {
      if (!isActive) return;
      try {
        ctx.drawImage(thumbVideo, 0, 0, thumbWidth, thumbHeight);
        thumbs.push(canvas.toDataURL('image/jpeg', 0.5));
      } catch {
        // Ignore CORS or other errors
      }
      currentThumb++;
      captureFrame();
    };

    const handleCanPlay = () => captureFrame();

    thumbVideo.addEventListener('seeked', handleSeeked);
    thumbVideo.addEventListener('canplay', handleCanPlay, { once: true });
    thumbVideo.load();

    return () => {
      isActive = false;
      thumbVideo.removeEventListener('seeked', handleSeeked);
      thumbVideo.removeEventListener('canplay', handleCanPlay);
      thumbVideo.remove();
    };
  }, [duration, videoUrl, thumbnails.length]);

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => setDuration(video.duration);
    const handleTimeUpdate = () => {
      if (!isScrubbingTimeline) setCurrentTime(video.currentTime);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
    };
  }, [isScrubbingTimeline]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isProcessing) return;

      if (e.code === 'Space') {
        e.preventDefault();
        handlePlayPause();
      }
      if (e.code === 'ArrowLeft') {
        e.preventDefault();
        seekTo(Math.max(0, currentTime - 1));
      }
      if (e.code === 'ArrowRight') {
        e.preventDefault();
        seekTo(Math.min(duration, currentTime + 1));
      }
      if (e.code === 'Escape') {
        onClose();
      }
      // Delete selected segment with Backspace/Delete
      if ((e.code === 'Backspace' || e.code === 'Delete') && selectedSegmentId) {
        e.preventDefault();
        toggleSegmentDeleted(selectedSegmentId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isProcessing, currentTime, duration, onClose, selectedSegmentId]);

  const handlePlayPause = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
  }, [isPlaying]);

  const seekTo = useCallback((time: number) => {
    if (!videoRef.current) return;
    const clampedTime = Math.max(0, Math.min(duration, time));
    videoRef.current.currentTime = clampedTime;
    setCurrentTime(clampedTime);
  }, [duration]);

  // Split the video at current playhead position
  const handleSplit = useCallback(() => {
    if (duration === 0) return;

    // Don't split too close to start or end
    if (currentTime < 0.5 || currentTime > duration - 0.5) return;

    // Find which segment contains the current time
    const segmentIndex = segments.findIndex(
      s => currentTime >= s.start && currentTime < s.end
    );
    if (segmentIndex === -1) return;

    const segment = segments[segmentIndex];

    // Don't split if too close to existing split points
    if (currentTime - segment.start < 0.5 || segment.end - currentTime < 0.5) return;

    // Create two new segments from the split
    const newSegments = [...segments];
    newSegments.splice(segmentIndex, 1,
      { id: `${Date.now()}-a`, start: segment.start, end: currentTime, deleted: segment.deleted },
      { id: `${Date.now()}-b`, start: currentTime, end: segment.end, deleted: segment.deleted }
    );
    setSegments(newSegments);
  }, [currentTime, duration, segments]);

  // Toggle a segment as deleted/kept
  const toggleSegmentDeleted = useCallback((segmentId: string) => {
    setSegments(prev => prev.map(s =>
      s.id === segmentId ? { ...s, deleted: !s.deleted } : s
    ));
  }, []);

  // Select a segment when tapped
  const handleSegmentClick = useCallback((segmentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedSegmentId(prev => prev === segmentId ? null : segmentId);
  }, []);

  // Get time position from pointer event
  const getTimeFromEvent = useCallback((e: React.TouchEvent | React.MouseEvent | TouchEvent | MouseEvent) => {
    if (!timelineRef.current) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    let clientX: number;
    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
    } else if ('changedTouches' in e && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX;
    } else if ('clientX' in e) {
      clientX = e.clientX;
    } else {
      return 0;
    }
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    return percentage * duration;
  }, [duration]);

  // Timeline pointer handlers
  const handleTimelinePointerDown = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const time = getTimeFromEvent(e);
    setIsScrubbingTimeline(true);
    seekTo(time);
    setSelectedSegmentId(null); // Deselect when scrubbing
  }, [getTimeFromEvent, seekTo]);

  // Global pointer events for scrubbing
  useEffect(() => {
    if (!isScrubbingTimeline) return;

    const handleMove = (e: TouchEvent | MouseEvent) => {
      if (!timelineRef.current || !videoRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      let clientX: number;
      if ('touches' in e && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
      } else if ('changedTouches' in e && e.changedTouches.length > 0) {
        clientX = e.changedTouches[0].clientX;
      } else if ('clientX' in e) {
        clientX = e.clientX;
      } else {
        return;
      }
      const x = clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, x / rect.width));
      const time = percentage * duration;
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    };

    const handleUp = () => setIsScrubbingTimeline(false);

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleUp);
    window.addEventListener('touchcancel', handleUp);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
      window.removeEventListener('touchcancel', handleUp);
    };
  }, [isScrubbingTimeline, duration]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
  };

  // Export - remove deleted segments
  const handleExport = async () => {
    const deletedSegments = segments.filter(s => s.deleted);
    if (deletedSegments.length === 0) {
      onClose();
      return;
    }

    setIsProcessing(true);

    try {
      // Convert deleted segments to sections to remove
      const sectionsToRemove = deletedSegments.map(s => ({ start: s.start, end: s.end }));

      const response = await fetch('/api/remove-sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, sectionsToRemove }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Export failed');
      }

      const data = await response.json();
      onComplete?.(data.filename, {
        sectionsRemoved: data.stats.sectionsRemoved,
        timeRemoved: data.stats.timeRemoved,
      });
      onClose();
    } catch (error) {
      console.error('Export error:', error);
      alert(error instanceof Error ? error.message : 'Failed to export video');
    } finally {
      setIsProcessing(false);
    }
  };

  const deletedSegments = segments.filter(s => s.deleted);
  const totalDeletedTime = deletedSegments.reduce((sum, s) => sum + (s.end - s.start), 0);
  const playheadPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const selectedSegment = segments.find(s => s.id === selectedSegmentId);
  const hasChanges = deletedSegments.length > 0;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900/90 backdrop-blur-sm border-b border-gray-800">
        <button
          onClick={onClose}
          disabled={isProcessing}
          className="p-2 -ml-2 text-gray-400 hover:text-white active:scale-95 transition-all disabled:opacity-50"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h1 className="text-white font-medium text-sm truncate max-w-[50%]">{videoName}</h1>

        <button
          onClick={handleExport}
          disabled={isProcessing}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 active:scale-95 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-all"
        >
          {isProcessing ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            'Done'
          )}
        </button>
      </div>

      {/* Video Preview */}
      <div className="flex-1 relative bg-black flex items-center justify-center min-h-0">
        <video
          ref={videoRef}
          src={videoUrl}
          className="max-w-full max-h-full object-contain"
          playsInline
          onClick={handlePlayPause}
        />

        {/* Play/Pause overlay */}
        <button
          onClick={handlePlayPause}
          className="absolute inset-0 flex items-center justify-center group"
        >
          <div className={`w-16 h-16 rounded-full bg-black/50 flex items-center justify-center transition-opacity ${isPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}>
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

        {/* Current time badge */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-black/70 backdrop-blur-sm rounded-full">
          <span className="text-white text-sm font-mono">{formatTime(currentTime)}</span>
          <span className="text-gray-400 text-sm font-mono"> / {formatTime(duration)}</span>
        </div>
      </div>

      {/* Timeline Section */}
      <div className="bg-gray-900 border-t border-gray-800">
        {/* Time markers */}
        <div className="px-4 py-2 flex justify-between text-xs text-gray-500 font-mono">
          <span>{formatTime(0)}</span>
          <span>{formatTime(duration / 2)}</span>
          <span>{formatTime(duration)}</span>
        </div>

        {/* Timeline with segments */}
        <div className="relative mx-4 mb-2 h-20 touch-none select-none">
          <div
            ref={timelineRef}
            className="relative h-full bg-gray-800 rounded-lg overflow-hidden cursor-pointer"
            onMouseDown={handleTimelinePointerDown}
            onTouchStart={handleTimelinePointerDown}
          >
            {/* Thumbnail strip */}
            <div className="absolute inset-0 flex">
              {thumbnails.length > 0 ? (
                thumbnails.map((thumb, i) => (
                  <div
                    key={i}
                    className="h-full flex-1 bg-cover bg-center border-r border-gray-700/30 last:border-r-0"
                    style={{ backgroundImage: `url(${thumb})` }}
                  />
                ))
              ) : (
                <div className="flex-1 bg-gradient-to-r from-gray-700 via-gray-600 to-gray-700 animate-pulse" />
              )}
            </div>

            {/* Segments overlay */}
            {segments.map(segment => {
              const leftPercent = (segment.start / duration) * 100;
              const widthPercent = ((segment.end - segment.start) / duration) * 100;
              const isSelected = segment.id === selectedSegmentId;

              return (
                <div
                  key={segment.id}
                  className={`absolute top-0 bottom-0 transition-all cursor-pointer ${
                    segment.deleted
                      ? 'bg-red-500/60'
                      : isSelected
                        ? 'bg-blue-500/30 ring-2 ring-blue-400 ring-inset'
                        : 'bg-transparent hover:bg-white/10'
                  }`}
                  style={{
                    left: `${leftPercent}%`,
                    width: `${widthPercent}%`,
                  }}
                  onClick={(e) => handleSegmentClick(segment.id, e)}
                >
                  {/* Deleted X indicator */}
                  {segment.deleted && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-8 h-8 rounded-full bg-red-600/80 flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Split point lines */}
            {segments.slice(1).map((segment, i) => (
              <div
                key={`split-${i}`}
                className="absolute top-0 bottom-0 w-0.5 bg-white/80 z-20 pointer-events-none"
                style={{ left: `${(segment.start / duration) * 100}%` }}
              />
            ))}

            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-yellow-400 z-30 pointer-events-none"
              style={{ left: `${playheadPercent}%` }}
            >
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-4 h-4 bg-yellow-400 rounded-full shadow-lg" />
            </div>
          </div>
        </div>

        {/* Status bar */}
        <div className="px-4 py-2 text-center">
          {hasChanges ? (
            <p className="text-xs text-gray-400">
              Removing <span className="text-red-400 font-medium">{formatTime(totalDeletedTime)}</span> ({deletedSegments.length} clip{deletedSegments.length !== 1 ? 's' : ''}) - Final: {formatTime(duration - totalDeletedTime)}
            </p>
          ) : (
            <p className="text-xs text-gray-500">
              Split the video, then tap clips to delete them
            </p>
          )}
        </div>
      </div>

      {/* Bottom Toolbar */}
      <div className="bg-gray-900 border-t border-gray-800 pb-safe">
        <div className="flex items-center justify-center gap-3 px-4 py-4">
          {/* Split button */}
          <button
            onClick={handleSplit}
            disabled={currentTime < 0.5 || currentTime > duration - 0.5}
            className="flex flex-col items-center gap-1 px-6 py-3 bg-white/10 hover:bg-white/20 active:scale-95 disabled:opacity-30 disabled:active:scale-100 rounded-xl transition-all"
          >
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m0-8h.01" />
            </svg>
            <span className="text-white text-xs font-medium">Split</span>
          </button>

          {/* Delete/Restore button - only shows when segment selected */}
          {selectedSegment && (
            <button
              onClick={() => toggleSegmentDeleted(selectedSegment.id)}
              className={`flex flex-col items-center gap-1 px-6 py-3 rounded-xl transition-all active:scale-95 ${
                selectedSegment.deleted
                  ? 'bg-green-500 hover:bg-green-600'
                  : 'bg-red-500 hover:bg-red-600'
              }`}
            >
              {selectedSegment.deleted ? (
                <>
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                  <span className="text-white text-xs font-medium">Restore</span>
                </>
              ) : (
                <>
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span className="text-white text-xs font-medium">Delete</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
