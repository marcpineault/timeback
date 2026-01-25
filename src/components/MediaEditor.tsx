'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

type EditorMode = 'trim' | 'split' | 'cut';

interface SplitPart {
  partNumber: number;
  filename: string;
  downloadUrl: string;
}

interface CutSection {
  id: string;
  start: number;
  end: number;
}

interface MediaEditorProps {
  videoUrl: string;
  videoName: string;
  filename: string;
  onClose: () => void;
  onTrimComplete?: (filename: string) => void;
  onSplitComplete?: (parts: SplitPart[]) => void;
  onRemoveComplete?: (filename: string, stats: { sectionsRemoved: number; timeRemoved: number }) => void;
  initialMode?: EditorMode;
}

export default function MediaEditor({
  videoUrl,
  videoName,
  filename,
  onClose,
  onTrimComplete,
  onSplitComplete,
  onRemoveComplete,
  initialMode = 'trim',
}: MediaEditorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const timelineContainerRef = useRef<HTMLDivElement>(null);

  // Core state
  const [mode, setMode] = useState<EditorMode>(initialMode);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Trim state
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);

  // Split state
  const [splitPoints, setSplitPoints] = useState<number[]>([]);

  // Cut sections state (sections to remove)
  const [cutSections, setCutSections] = useState<CutSection[]>([]);
  const [activeCutStart, setActiveCutStart] = useState<number | null>(null);

  // Timeline state
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState<'trim-start' | 'trim-end' | 'playhead' | 'split' | null>(null);
  const [dragSplitIndex, setDragSplitIndex] = useState<number | null>(null);
  const [isScrubbingTimeline, setIsScrubbingTimeline] = useState(false);

  // Long press for split
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const [showSplitIndicator, setShowSplitIndicator] = useState(false);

  // Generate video thumbnails using a separate video element
  useEffect(() => {
    if (duration === 0 || thumbnails.length > 0) return;

    // Create a separate video element for thumbnail generation
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
        // Ignore CORS or other errors, just skip this thumbnail
      }
      currentThumb++;
      captureFrame();
    };

    const handleCanPlay = () => {
      captureFrame();
    };

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

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      setTrimEnd(video.duration);
    };

    const handleTimeUpdate = () => {
      if (!isScrubbingTimeline) {
        setCurrentTime(video.currentTime);
      }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      video.currentTime = trimStart;
      setIsPlaying(false);
    };

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
  }, [trimStart, isScrubbingTimeline]);

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
      if (e.code === 'KeyS' && mode === 'split') {
        e.preventDefault();
        handleSplit();
      }
      if (e.code === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isProcessing, currentTime, duration, mode]);

  const handlePlayPause = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      // If at or past trim end, restart from trim start
      if (videoRef.current.currentTime >= trimEnd) {
        videoRef.current.currentTime = trimStart;
      }
      videoRef.current.play();
    }
  }, [isPlaying, trimStart, trimEnd]);

  const seekTo = useCallback((time: number) => {
    if (!videoRef.current) return;
    const clampedTime = Math.max(0, Math.min(duration, time));
    videoRef.current.currentTime = clampedTime;
    setCurrentTime(clampedTime);
  }, [duration]);

  const handleSplit = useCallback(() => {
    if (currentTime > 0.5 && currentTime < duration - 0.5) {
      const nearby = splitPoints.some(p => Math.abs(p - currentTime) < 0.5);
      if (!nearby) {
        setSplitPoints(prev => [...prev, currentTime].sort((a, b) => a - b));
        // Visual feedback
        setShowSplitIndicator(true);
        setTimeout(() => setShowSplitIndicator(false), 300);
      }
    }
  }, [currentTime, duration, splitPoints]);

  const handleCut = useCallback(() => {
    if (activeCutStart === null) {
      // Start new cut
      setActiveCutStart(currentTime);
    } else {
      // End cut
      if (currentTime > activeCutStart) {
        setCutSections(prev => [...prev, {
          id: Date.now().toString(),
          start: activeCutStart,
          end: currentTime,
        }].sort((a, b) => a.start - b.start));
      }
      setActiveCutStart(null);
    }
  }, [currentTime, activeCutStart]);

  const removeCutSection = useCallback((id: string) => {
    setCutSections(prev => prev.filter(s => s.id !== id));
  }, []);

  const removeSplitPoint = useCallback((index: number) => {
    setSplitPoints(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Get position from touch/mouse event
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

  // Timeline touch/mouse handlers
  const handleTimelinePointerDown = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const time = getTimeFromEvent(e);
    setIsScrubbingTimeline(true);
    seekTo(time);

    // Start long press timer for split mode
    if (mode === 'split') {
      longPressTimer.current = setTimeout(() => {
        handleSplit();
      }, 500);
    }
  }, [getTimeFromEvent, seekTo, mode, handleSplit]);

  // Handle trim handle drag start
  const handleTrimHandleStart = useCallback((handle: 'trim-start' | 'trim-end', e: React.TouchEvent | React.MouseEvent) => {
    e.stopPropagation();
    setIsDragging(handle);
  }, []);

  // Handle split point drag start
  const handleSplitDragStart = useCallback((index: number, e: React.TouchEvent | React.MouseEvent) => {
    e.stopPropagation();
    setIsDragging('split');
    setDragSplitIndex(index);
  }, []);

  // Global pointer events for dragging
  useEffect(() => {
    if (!isDragging && !isScrubbingTimeline) return;

    const handleMove = (e: TouchEvent | MouseEvent) => {
      if (!timelineRef.current) return;
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

      if (isDragging === 'trim-start') {
        setTrimStart(Math.min(time, trimEnd - 0.5));
      } else if (isDragging === 'trim-end') {
        setTrimEnd(Math.max(time, trimStart + 0.5));
      } else if (isDragging === 'split' && dragSplitIndex !== null) {
        setSplitPoints(prev => {
          const newPoints = [...prev];
          newPoints[dragSplitIndex] = Math.max(0.5, Math.min(duration - 0.5, time));
          return newPoints.sort((a, b) => a - b);
        });
      } else if (isScrubbingTimeline && videoRef.current) {
        const clampedTime = Math.max(0, Math.min(duration, time));
        videoRef.current.currentTime = clampedTime;
        setCurrentTime(clampedTime);
      }
    };

    const handleUp = () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      setIsScrubbingTimeline(false);
      setIsDragging(null);
      setDragSplitIndex(null);
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
  }, [isDragging, isScrubbingTimeline, trimStart, trimEnd, duration, dragSplitIndex]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
  };

  // Calculate positions
  const trimStartPercent = duration > 0 ? (trimStart / duration) * 100 : 0;
  const trimEndPercent = duration > 0 ? (trimEnd / duration) * 100 : 100;
  const playheadPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // API calls
  const handleApplyTrim = async () => {
    if (trimStart === 0 && trimEnd === duration) return;

    setIsProcessing(true);

    try {
      const response = await fetch('/api/trim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, startTime: trimStart, endTime: trimEnd }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Trim failed');
      }

      const data = await response.json();
      onTrimComplete?.(data.filename);
      onClose();
    } catch (error) {
      console.error('Trim error:', error);
      alert(error instanceof Error ? error.message : 'Failed to trim video');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApplySplit = async () => {
    if (splitPoints.length === 0) return;

    setIsProcessing(true);

    try {
      const response = await fetch('/api/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, splitPoints }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Split failed');
      }

      const data = await response.json();
      onSplitComplete?.(data.parts);
      onClose();
    } catch (error) {
      console.error('Split error:', error);
      alert(error instanceof Error ? error.message : 'Failed to split video');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApplyCut = async () => {
    if (cutSections.length === 0) return;

    setIsProcessing(true);

    try {
      const response = await fetch('/api/remove-sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename,
          sectionsToRemove: cutSections.map(s => ({ start: s.start, end: s.end }))
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Cut failed');
      }

      const data = await response.json();
      onRemoveComplete?.(data.filename, {
        sectionsRemoved: data.stats.sectionsRemoved,
        timeRemoved: data.stats.timeRemoved,
      });
      onClose();
    } catch (error) {
      console.error('Cut error:', error);
      alert(error instanceof Error ? error.message : 'Failed to cut video');
    } finally {
      setIsProcessing(false);
    }
  };

  const totalCutTime = cutSections.reduce((sum, s) => sum + (s.end - s.start), 0);
  const trimmedDuration = trimEnd - trimStart;

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
          onClick={() => {
            if (mode === 'trim') handleApplyTrim();
            else if (mode === 'split') handleApplySplit();
            else if (mode === 'cut') handleApplyCut();
          }}
          disabled={isProcessing || (mode === 'trim' && trimStart === 0 && trimEnd === duration) || (mode === 'split' && splitPoints.length === 0) || (mode === 'cut' && cutSections.length === 0)}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 active:scale-95 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-all"
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

        {/* Split indicator */}
        {showSplitIndicator && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="px-4 py-2 bg-orange-500 text-white rounded-lg font-medium animate-pulse">
              Split Added!
            </div>
          </div>
        )}

        {/* Current time badge */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-black/70 backdrop-blur-sm rounded-full">
          <span className="text-white text-sm font-mono">{formatTime(currentTime)}</span>
          <span className="text-gray-400 text-sm font-mono"> / {formatTime(duration)}</span>
        </div>

        {/* Mode-specific info */}
        {mode === 'trim' && (trimStart > 0 || trimEnd < duration) && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-blue-500/80 backdrop-blur-sm rounded-full">
            <span className="text-white text-xs">Trimmed: {formatTime(trimmedDuration)}</span>
          </div>
        )}
        {mode === 'cut' && activeCutStart !== null && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-red-500/80 backdrop-blur-sm rounded-full animate-pulse">
            <span className="text-white text-xs">Cutting from {formatTime(activeCutStart)}...</span>
          </div>
        )}
      </div>

      {/* Timeline Section */}
      <div className="bg-gray-900 border-t border-gray-800">
        {/* Time markers */}
        <div className="px-4 py-2 flex justify-between text-xs text-gray-500 font-mono">
          <span>{formatTime(0)}</span>
          <span>{formatTime(duration / 2)}</span>
          <span>{formatTime(duration)}</span>
        </div>

        {/* Timeline with thumbnails */}
        <div
          ref={timelineContainerRef}
          className="relative mx-4 mb-2 h-20 touch-none select-none"
        >
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

            {/* Trim region overlay (grayed out areas) */}
            {mode === 'trim' && (
              <>
                <div
                  className="absolute top-0 bottom-0 left-0 bg-black/70 z-10"
                  style={{ width: `${trimStartPercent}%` }}
                />
                <div
                  className="absolute top-0 bottom-0 right-0 bg-black/70 z-10"
                  style={{ width: `${100 - trimEndPercent}%` }}
                />
              </>
            )}

            {/* Cut sections (red overlays) */}
            {mode === 'cut' && cutSections.map(section => (
              <div
                key={section.id}
                className="absolute top-0 bottom-0 bg-red-500/50 border-x-2 border-red-500 z-10 group"
                style={{
                  left: `${(section.start / duration) * 100}%`,
                  width: `${((section.end - section.start) / duration) * 100}%`,
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeCutSection(section.id);
                  }}
                  className="absolute -top-2 right-0 w-6 h-6 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center opacity-100 z-20"
                >
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}

            {/* Active cut region */}
            {mode === 'cut' && activeCutStart !== null && (
              <div
                className="absolute top-0 bottom-0 bg-red-500/30 border-l-2 border-red-500 border-dashed z-10 animate-pulse"
                style={{
                  left: `${(activeCutStart / duration) * 100}%`,
                  width: `${((currentTime - activeCutStart) / duration) * 100}%`,
                }}
              />
            )}

            {/* Split points */}
            {mode === 'split' && splitPoints.map((point, index) => (
              <div
                key={index}
                className="absolute top-0 bottom-0 z-20 group"
                style={{ left: `${(point / duration) * 100}%` }}
              >
                <div
                  className="absolute top-0 bottom-0 w-1 bg-orange-500 -translate-x-1/2 cursor-ew-resize"
                  onMouseDown={(e) => handleSplitDragStart(index, e)}
                  onTouchStart={(e) => handleSplitDragStart(index, e)}
                />
                <div
                  className="absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center shadow-lg cursor-ew-resize active:scale-110 transition-transform"
                  onMouseDown={(e) => handleSplitDragStart(index, e)}
                  onTouchStart={(e) => handleSplitDragStart(index, e)}
                >
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                  </svg>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSplitPoint(index);
                  }}
                  className="absolute -bottom-1 left-0 -translate-x-1/2 w-6 h-6 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-30"
                >
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}

            {/* Trim handles */}
            {mode === 'trim' && (
              <>
                {/* Start handle */}
                <div
                  className="absolute top-0 bottom-0 z-30 cursor-ew-resize"
                  style={{ left: `calc(${trimStartPercent}% - 12px)` }}
                  onMouseDown={(e) => handleTrimHandleStart('trim-start', e)}
                  onTouchStart={(e) => handleTrimHandleStart('trim-start', e)}
                >
                  <div className="w-6 h-full bg-yellow-400 rounded-l-md flex items-center justify-center active:bg-yellow-300 transition-colors">
                    <div className="w-1 h-8 bg-yellow-600 rounded-full" />
                  </div>
                </div>

                {/* End handle */}
                <div
                  className="absolute top-0 bottom-0 z-30 cursor-ew-resize"
                  style={{ left: `calc(${trimEndPercent}% - 12px)` }}
                  onMouseDown={(e) => handleTrimHandleStart('trim-end', e)}
                  onTouchStart={(e) => handleTrimHandleStart('trim-end', e)}
                >
                  <div className="w-6 h-full bg-yellow-400 rounded-r-md flex items-center justify-center active:bg-yellow-300 transition-colors">
                    <div className="w-1 h-8 bg-yellow-600 rounded-full" />
                  </div>
                </div>

                {/* Trim border */}
                <div
                  className="absolute top-0 bottom-0 border-y-4 border-yellow-400 pointer-events-none z-20"
                  style={{
                    left: `${trimStartPercent}%`,
                    width: `${trimEndPercent - trimStartPercent}%`,
                  }}
                />
              </>
            )}

            {/* Playhead (center indicator line) */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white z-40 pointer-events-none"
              style={{ left: `${playheadPercent}%` }}
            >
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-4 h-4 bg-white rounded-full shadow-lg" />
            </div>
          </div>
        </div>

        {/* Mode-specific status bar */}
        <div className="px-4 py-2 text-center">
          {mode === 'trim' && (trimStart > 0 || trimEnd < duration) && (
            <p className="text-xs text-gray-400">
              Keeping <span className="text-blue-400 font-medium">{formatTime(trimmedDuration)}</span> of {formatTime(duration)}
            </p>
          )}
          {mode === 'split' && splitPoints.length > 0 && (
            <p className="text-xs text-gray-400">
              <span className="text-orange-400 font-medium">{splitPoints.length + 1}</span> clips will be created
            </p>
          )}
          {mode === 'cut' && cutSections.length > 0 && (
            <p className="text-xs text-gray-400">
              Removing <span className="text-red-400 font-medium">{formatTime(totalCutTime)}</span> • Final: {formatTime(duration - totalCutTime)}
            </p>
          )}
          {((mode === 'trim' && trimStart === 0 && trimEnd === duration) ||
            (mode === 'split' && splitPoints.length === 0) ||
            (mode === 'cut' && cutSections.length === 0 && activeCutStart === null)) && (
            <p className="text-xs text-gray-500">
              {mode === 'trim' && 'Drag the yellow handles to trim'}
              {mode === 'split' && 'Tap timeline or press the Split button'}
              {mode === 'cut' && 'Tap Cut to mark start, tap again to mark end'}
            </p>
          )}
        </div>
      </div>

      {/* Bottom Toolbar - CapCut Style */}
      <div className="bg-gray-900 border-t border-gray-800 pb-safe">
        {/* Action buttons for current mode */}
        <div className="flex items-center justify-center gap-4 px-4 py-3">
          {mode === 'split' && (
            <button
              onClick={handleSplit}
              disabled={currentTime <= 0.5 || currentTime >= duration - 0.5}
              className="flex flex-col items-center gap-1 px-6 py-2 bg-orange-500 hover:bg-orange-600 active:scale-95 disabled:bg-gray-700 disabled:text-gray-500 rounded-xl transition-all"
            >
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="text-white text-xs font-medium">Split Here</span>
            </button>
          )}
          {mode === 'cut' && (
            <button
              onClick={handleCut}
              className={`flex flex-col items-center gap-1 px-6 py-2 rounded-xl transition-all active:scale-95 ${
                activeCutStart !== null
                  ? 'bg-red-600 hover:bg-red-700 animate-pulse'
                  : 'bg-red-500 hover:bg-red-600'
              }`}
            >
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
              </svg>
              <span className="text-white text-xs font-medium">
                {activeCutStart !== null ? 'End Cut' : 'Start Cut'}
              </span>
            </button>
          )}
          {mode === 'cut' && activeCutStart !== null && (
            <button
              onClick={() => setActiveCutStart(null)}
              className="flex flex-col items-center gap-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 active:scale-95 rounded-xl transition-all"
            >
              <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span className="text-gray-300 text-xs font-medium">Cancel</span>
            </button>
          )}
        </div>

        {/* Mode selector tabs */}
        <div className="flex items-center justify-around px-2 py-2 border-t border-gray-800">
          <button
            onClick={() => setMode('trim')}
            className={`flex flex-col items-center gap-1.5 px-6 py-2 rounded-xl transition-all active:scale-95 ${
              mode === 'trim' ? 'bg-blue-500/20' : ''
            }`}
          >
            <svg className={`w-6 h-6 ${mode === 'trim' ? 'text-blue-400' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
            </svg>
            <span className={`text-xs font-medium ${mode === 'trim' ? 'text-blue-400' : 'text-gray-400'}`}>Trim</span>
          </button>

          <button
            onClick={() => setMode('split')}
            className={`flex flex-col items-center gap-1.5 px-6 py-2 rounded-xl transition-all active:scale-95 ${
              mode === 'split' ? 'bg-orange-500/20' : ''
            }`}
          >
            <svg className={`w-6 h-6 ${mode === 'split' ? 'text-orange-400' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
            <span className={`text-xs font-medium ${mode === 'split' ? 'text-orange-400' : 'text-gray-400'}`}>Split</span>
          </button>

          <button
            onClick={() => setMode('cut')}
            className={`flex flex-col items-center gap-1.5 px-6 py-2 rounded-xl transition-all active:scale-95 ${
              mode === 'cut' ? 'bg-red-500/20' : ''
            }`}
          >
            <svg className={`w-6 h-6 ${mode === 'cut' ? 'text-red-400' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
            </svg>
            <span className={`text-xs font-medium ${mode === 'cut' ? 'text-red-400' : 'text-gray-400'}`}>Cut</span>
          </button>
        </div>
      </div>
    </div>
  );
}
