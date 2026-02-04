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

type DragHandle = 'left' | 'right' | null;

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

  // Segments state
  const [segments, setSegments] = useState<Segment[]>([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);

  // Timeline state
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [isScrubbingTimeline, setIsScrubbingTimeline] = useState(false);

  // Trim handle dragging
  const [draggingHandle, setDraggingHandle] = useState<DragHandle>(null);
  const [draggingSegmentId, setDraggingSegmentId] = useState<string | null>(null);

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
      if (!isScrubbingTimeline && !draggingHandle) setCurrentTime(video.currentTime);
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
  }, [isScrubbingTimeline, draggingHandle]);

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

  // Split at current playhead
  const handleSplit = useCallback(() => {
    if (duration === 0) return;
    if (currentTime < 0.5 || currentTime > duration - 0.5) return;

    const segmentIndex = segments.findIndex(
      s => currentTime >= s.start && currentTime < s.end
    );
    if (segmentIndex === -1) return;

    const segment = segments[segmentIndex];
    if (currentTime - segment.start < 0.5 || segment.end - currentTime < 0.5) return;

    const newSegments = [...segments];
    newSegments.splice(segmentIndex, 1,
      { id: `${Date.now()}-a`, start: segment.start, end: currentTime, deleted: segment.deleted },
      { id: `${Date.now()}-b`, start: currentTime, end: segment.end, deleted: segment.deleted }
    );
    setSegments(newSegments);
  }, [currentTime, duration, segments]);

  const toggleSegmentDeleted = useCallback((segmentId: string) => {
    setSegments(prev => prev.map(s =>
      s.id === segmentId ? { ...s, deleted: !s.deleted } : s
    ));
  }, []);

  // Get time from pointer position
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

  // Start dragging a trim handle
  const handleTrimHandleDown = useCallback((segmentId: string, handle: DragHandle, e: React.TouchEvent | React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setDraggingSegmentId(segmentId);
    setDraggingHandle(handle);
    setSelectedSegmentId(segmentId);

    // Pause video while trimming
    if (videoRef.current && isPlaying) {
      videoRef.current.pause();
    }
  }, [isPlaying]);

  // Handle trim dragging
  useEffect(() => {
    if (!draggingHandle || !draggingSegmentId) return;

    const handleMove = (e: TouchEvent | MouseEvent) => {
      const time = getTimeFromEvent(e);

      setSegments(prev => {
        const segmentIndex = prev.findIndex(s => s.id === draggingSegmentId);
        if (segmentIndex === -1) return prev;

        const segment = prev[segmentIndex];
        const newSegments = [...prev];
        const minDuration = 0.5; // Minimum segment duration

        if (draggingHandle === 'left') {
          // Find the previous segment's end as the minimum bound
          const minTime = segmentIndex > 0 ? prev[segmentIndex - 1].end : 0;
          const maxTime = segment.end - minDuration;
          const newStart = Math.max(minTime, Math.min(maxTime, time));
          newSegments[segmentIndex] = { ...segment, start: newStart };

          // Update video preview to show trim position
          if (videoRef.current) {
            videoRef.current.currentTime = newStart;
            setCurrentTime(newStart);
          }
        } else if (draggingHandle === 'right') {
          // Find the next segment's start as the maximum bound
          const maxTime = segmentIndex < prev.length - 1 ? prev[segmentIndex + 1].start : duration;
          const minTime = segment.start + minDuration;
          const newEnd = Math.max(minTime, Math.min(maxTime, time));
          newSegments[segmentIndex] = { ...segment, end: newEnd };

          // Update video preview to show trim position
          if (videoRef.current) {
            videoRef.current.currentTime = newEnd;
            setCurrentTime(newEnd);
          }
        }

        return newSegments;
      });
    };

    const handleUp = () => {
      setDraggingHandle(null);
      setDraggingSegmentId(null);
    };

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
  }, [draggingHandle, draggingSegmentId, duration, getTimeFromEvent]);

  // Timeline scrubbing (when not dragging a handle)
  const handleTimelinePointerDown = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    // Don't start scrubbing if clicking on a handle
    const target = e.target as HTMLElement;
    if (target.closest('[data-handle]')) return;

    const time = getTimeFromEvent(e);
    setIsScrubbingTimeline(true);
    seekTo(time);
  }, [getTimeFromEvent, seekTo]);

  useEffect(() => {
    if (!isScrubbingTimeline) return;

    const handleMove = (e: TouchEvent | MouseEvent) => {
      const time = getTimeFromEvent(e);
      if (videoRef.current) {
        videoRef.current.currentTime = time;
        setCurrentTime(time);
      }
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
  }, [isScrubbingTimeline, getTimeFromEvent]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
  };

  // Export - remove deleted segments and trimmed parts
  const handleExport = async () => {
    // Calculate sections to remove:
    // 1. Deleted segments
    // 2. Trimmed areas (gaps between original and current segment bounds)
    const sectionsToRemove: { start: number; end: number }[] = [];

    // Add deleted segments
    segments.filter(s => s.deleted).forEach(s => {
      sectionsToRemove.push({ start: s.start, end: s.end });
    });

    // Add gaps (trimmed areas) - areas that are not covered by any non-deleted segment
    let lastEnd = 0;
    const nonDeletedSegments = segments.filter(s => !s.deleted).sort((a, b) => a.start - b.start);

    for (const segment of nonDeletedSegments) {
      if (segment.start > lastEnd) {
        sectionsToRemove.push({ start: lastEnd, end: segment.start });
      }
      lastEnd = segment.end;
    }

    // Add any remaining part at the end
    if (lastEnd < duration && nonDeletedSegments.length > 0) {
      sectionsToRemove.push({ start: lastEnd, end: duration });
    }

    // If nothing to remove, just close
    if (sectionsToRemove.length === 0) {
      onClose();
      return;
    }

    setIsProcessing(true);

    try {
      // Merge overlapping sections and sort
      const mergedSections = sectionsToRemove
        .sort((a, b) => a.start - b.start)
        .reduce((acc: { start: number; end: number }[], curr) => {
          if (acc.length === 0) return [curr];
          const last = acc[acc.length - 1];
          if (curr.start <= last.end) {
            last.end = Math.max(last.end, curr.end);
          } else {
            acc.push(curr);
          }
          return acc;
        }, []);

      const response = await fetch('/api/remove-sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, sectionsToRemove: mergedSections }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Export failed');
      }

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

  // Calculate what's being removed
  const deletedSegments = segments.filter(s => s.deleted);
  const totalDeletedTime = deletedSegments.reduce((sum, s) => sum + (s.end - s.start), 0);

  // Also count trimmed time (gaps)
  let trimmedTime = 0;
  let lastEnd = 0;
  const nonDeletedSegments = segments.filter(s => !s.deleted).sort((a, b) => a.start - b.start);
  for (const segment of nonDeletedSegments) {
    if (segment.start > lastEnd) {
      trimmedTime += segment.start - lastEnd;
    }
    lastEnd = segment.end;
  }
  if (lastEnd < duration && nonDeletedSegments.length > 0) {
    trimmedTime += duration - lastEnd;
  }

  const totalRemovedTime = totalDeletedTime + trimmedTime;
  const playheadPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const selectedSegment = segments.find(s => s.id === selectedSegmentId);
  const hasChanges = totalRemovedTime > 0.1;

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
          className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 active:scale-95 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-all"
        >
          {isProcessing ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            'Export'
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
        {/* Playhead indicator above timeline */}
        <div className="px-4 py-2 flex justify-between items-center">
          <span className="text-xs text-gray-500 font-mono">{formatTime(0)}</span>
          <span className="text-xs text-white font-mono">{formatTime(currentTime)}</span>
          <span className="text-xs text-gray-500 font-mono">{formatTime(duration)}</span>
        </div>

        {/* Timeline with segments */}
        <div className="relative mx-4 mb-2 touch-none select-none">
          <div
            ref={timelineRef}
            className="relative h-16 bg-gray-800 rounded-lg overflow-visible cursor-pointer"
            onMouseDown={handleTimelinePointerDown}
            onTouchStart={handleTimelinePointerDown}
          >
            {/* Thumbnail strip */}
            <div className="absolute inset-0 flex rounded-lg overflow-hidden">
              {thumbnails.length > 0 ? (
                thumbnails.map((thumb, i) => (
                  <div
                    key={i}
                    className="h-full flex-1 bg-cover bg-center"
                    style={{ backgroundImage: `url(${thumb})` }}
                  />
                ))
              ) : (
                <div className="flex-1 bg-gradient-to-r from-gray-700 via-gray-600 to-gray-700 animate-pulse" />
              )}
            </div>

            {/* Segments with trim handles */}
            {segments.map((segment, index) => {
              const leftPercent = (segment.start / duration) * 100;
              const widthPercent = ((segment.end - segment.start) / duration) * 100;
              const isSelected = segment.id === selectedSegmentId;
              const isDragging = draggingSegmentId === segment.id;

              return (
                <div
                  key={segment.id}
                  className={`absolute top-0 bottom-0 transition-colors ${
                    segment.deleted ? 'z-10' : 'z-20'
                  }`}
                  style={{
                    left: `${leftPercent}%`,
                    width: `${widthPercent}%`,
                  }}
                >
                  {/* Segment content */}
                  <div
                    className={`absolute inset-0 ${
                      segment.deleted
                        ? 'bg-red-500/70'
                        : isSelected
                          ? 'ring-2 ring-cyan-400 ring-inset bg-cyan-500/20'
                          : 'hover:bg-white/10'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedSegmentId(prev => prev === segment.id ? null : segment.id);
                    }}
                  >
                    {/* Deleted indicator */}
                    {segment.deleted && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <svg className="w-6 h-6 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Left trim handle - only show when selected and not deleted */}
                  {isSelected && !segment.deleted && (
                    <div
                      data-handle="left"
                      className={`absolute left-0 top-0 bottom-0 w-4 -ml-2 cursor-ew-resize z-30 flex items-center justify-center ${
                        isDragging && draggingHandle === 'left' ? 'scale-110' : ''
                      }`}
                      onMouseDown={(e) => handleTrimHandleDown(segment.id, 'left', e)}
                      onTouchStart={(e) => handleTrimHandleDown(segment.id, 'left', e)}
                    >
                      <div className="w-1.5 h-10 bg-cyan-400 rounded-full shadow-lg" />
                    </div>
                  )}

                  {/* Right trim handle - only show when selected and not deleted */}
                  {isSelected && !segment.deleted && (
                    <div
                      data-handle="right"
                      className={`absolute right-0 top-0 bottom-0 w-4 -mr-2 cursor-ew-resize z-30 flex items-center justify-center ${
                        isDragging && draggingHandle === 'right' ? 'scale-110' : ''
                      }`}
                      onMouseDown={(e) => handleTrimHandleDown(segment.id, 'right', e)}
                      onTouchStart={(e) => handleTrimHandleDown(segment.id, 'right', e)}
                    >
                      <div className="w-1.5 h-10 bg-cyan-400 rounded-full shadow-lg" />
                    </div>
                  )}

                  {/* Segment border for selected state */}
                  {isSelected && !segment.deleted && (
                    <>
                      <div className="absolute top-0 left-0 right-0 h-1 bg-cyan-400" />
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-cyan-400" />
                    </>
                  )}
                </div>
              );
            })}

            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white z-40 pointer-events-none"
              style={{ left: `${playheadPercent}%` }}
            >
              <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-white" />
            </div>
          </div>
        </div>

        {/* Status bar */}
        <div className="px-4 py-2 text-center">
          {hasChanges ? (
            <p className="text-xs text-gray-400">
              Removing <span className="text-red-400 font-medium">{formatTime(totalRemovedTime)}</span> - Final: <span className="text-green-400 font-medium">{formatTime(duration - totalRemovedTime)}</span>
            </p>
          ) : (
            <p className="text-xs text-gray-500">
              Tap a clip to select, then drag handles to trim or tap Delete
            </p>
          )}
        </div>
      </div>

      {/* Bottom Toolbar - CapCut style */}
      <div className="bg-gray-900 border-t border-gray-800 pb-safe">
        <div className="flex items-center justify-around px-4 py-3">
          {/* Split */}
          <button
            onClick={handleSplit}
            disabled={currentTime < 0.5 || currentTime > duration - 0.5}
            className="flex flex-col items-center gap-1 px-4 py-2 disabled:opacity-30 transition-all active:scale-95"
          >
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16M4 12h2M18 12h2" />
            </svg>
            <span className="text-white text-xs">Split</span>
          </button>

          {/* Delete - enabled when segment selected */}
          <button
            onClick={() => selectedSegment && toggleSegmentDeleted(selectedSegment.id)}
            disabled={!selectedSegment}
            className={`flex flex-col items-center gap-1 px-4 py-2 transition-all active:scale-95 ${
              !selectedSegment ? 'opacity-30' : selectedSegment.deleted ? 'text-green-400' : 'text-white'
            }`}
          >
            {selectedSegment?.deleted ? (
              <>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
                <span className="text-xs">Restore</span>
              </>
            ) : (
              <>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span className="text-xs">Delete</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
