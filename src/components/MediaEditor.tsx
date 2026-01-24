'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

type EditorMode = 'trim' | 'split' | 'remove' | 'all';

interface SplitPart {
  partNumber: number;
  filename: string;
  downloadUrl: string;
}

interface RemoveSection {
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
  initialMode = 'all',
}: MediaEditorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Core state
  const [mode, setMode] = useState<EditorMode>(initialMode);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingAction, setProcessingAction] = useState<'trim' | 'split' | 'remove' | null>(null);

  // Trim state
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [trimEnabled, setTrimEnabled] = useState(false);

  // Split state
  const [splitPoints, setSplitPoints] = useState<number[]>([]);

  // Remove sections state
  const [sectionsToRemove, setSectionsToRemove] = useState<RemoveSection[]>([]);
  const [removeMarkStart, setRemoveMarkStart] = useState<number | null>(null); // Temporary start point while marking

  // Drag state
  const [dragging, setDragging] = useState<'start' | 'end' | 'playhead' | null>(null);
  const [draggingSplitIndex, setDraggingSplitIndex] = useState<number | null>(null);

  // Remove section drag state (for click-drag to select sections)
  const [removeDragStart, setRemoveDragStart] = useState<number | null>(null);
  const [removeDragCurrent, setRemoveDragCurrent] = useState<number | null>(null);

  // Preview state
  const [previewingSegment, setPreviewingSegment] = useState<{ start: number; end: number } | null>(null);

  // Callback functions (defined before effects that use them)
  const handlePlayPause = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
  }, [isPlaying]);

  const seekRelative = useCallback((seconds: number) => {
    if (!videoRef.current) return;
    const newTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + seconds));
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  }, [duration]);

  const handleAddSplitPoint = useCallback(() => {
    if (currentTime > 0.5 && currentTime < duration - 0.5) {
      const nearby = splitPoints.some(p => Math.abs(p - currentTime) < 1);
      if (!nearby) {
        setSplitPoints(prev => [...prev, currentTime].sort((a, b) => a - b));
      }
    }
  }, [currentTime, duration, splitPoints]);

  const handleMarkRemoveStart = useCallback(() => {
    setRemoveMarkStart(currentTime);
  }, [currentTime]);

  const handleMarkRemoveEnd = useCallback(() => {
    if (removeMarkStart !== null && currentTime > removeMarkStart) {
      // Check for overlap with existing sections
      const newSection: RemoveSection = { start: removeMarkStart, end: currentTime };

      setSectionsToRemove(prev => {
        // Add new section and sort by start time
        const updated = [...prev, newSection].sort((a, b) => a.start - b.start);

        // Merge overlapping sections
        const merged: RemoveSection[] = [];
        for (const section of updated) {
          if (merged.length === 0) {
            merged.push({ ...section });
          } else {
            const last = merged[merged.length - 1];
            if (section.start <= last.end + 0.1) {
              // Overlapping or adjacent - merge
              last.end = Math.max(last.end, section.end);
            } else {
              merged.push({ ...section });
            }
          }
        }
        return merged;
      });

      setRemoveMarkStart(null);
    }
  }, [removeMarkStart, currentTime]);

  const handleRemoveSection = useCallback((index: number) => {
    setSectionsToRemove(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleClearRemoveSections = useCallback(() => {
    setSectionsToRemove([]);
    setRemoveMarkStart(null);
  }, []);

  // Quick cut - instantly mark a section around current position
  const handleQuickCut = useCallback((centerTime: number, halfDuration: number = 0.5) => {
    const cutStart = Math.max(0, centerTime - halfDuration);
    const cutEnd = Math.min(duration, centerTime + halfDuration);

    if (cutEnd - cutStart < 0.1) return; // Too short

    const newSection: RemoveSection = { start: cutStart, end: cutEnd };

    setSectionsToRemove(prev => {
      const updated = [...prev, newSection].sort((a, b) => a.start - b.start);

      // Merge overlapping sections
      const merged: RemoveSection[] = [];
      for (const section of updated) {
        if (merged.length === 0) {
          merged.push({ ...section });
        } else {
          const last = merged[merged.length - 1];
          if (section.start <= last.end + 0.1) {
            last.end = Math.max(last.end, section.end);
          } else {
            merged.push({ ...section });
          }
        }
      }
      return merged;
    });
  }, [duration]);

  // Add remove section from drag
  const handleAddRemoveSection = useCallback((startTime: number, endTime: number) => {
    if (endTime - startTime < 0.1) return; // Too short

    const newSection: RemoveSection = {
      start: Math.min(startTime, endTime),
      end: Math.max(startTime, endTime),
    };

    setSectionsToRemove(prev => {
      const updated = [...prev, newSection].sort((a, b) => a.start - b.start);

      // Merge overlapping sections
      const merged: RemoveSection[] = [];
      for (const section of updated) {
        if (merged.length === 0) {
          merged.push({ ...section });
        } else {
          const last = merged[merged.length - 1];
          if (section.start <= last.end + 0.1) {
            last.end = Math.max(last.end, section.end);
          } else {
            merged.push({ ...section });
          }
        }
      }
      return merged;
    });
  }, []);

  // Keyboard and escape handling
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isProcessing) {
        onClose();
      }
    };

    const handleKeyboard = (e: KeyboardEvent) => {
      if (isProcessing) return;

      // Space to play/pause
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        handlePlayPause();
      }

      // Left/Right arrows to seek
      if (e.code === 'ArrowLeft') {
        e.preventDefault();
        seekRelative(-1);
      }
      if (e.code === 'ArrowRight') {
        e.preventDefault();
        seekRelative(1);
      }

      // S to add split point (when in split or all mode)
      if (e.code === 'KeyS' && (mode === 'split' || mode === 'all') && e.target === document.body) {
        e.preventDefault();
        handleAddSplitPoint();
      }

      // I to set in point, O to set out point (when in trim or all mode)
      if (e.code === 'KeyI' && (mode === 'trim' || mode === 'all') && e.target === document.body) {
        e.preventDefault();
        setStartTime(currentTime);
        setTrimEnabled(true);
      }
      if (e.code === 'KeyO' && (mode === 'trim' || mode === 'all') && e.target === document.body) {
        e.preventDefault();
        setEndTime(currentTime);
        setTrimEnabled(true);
      }

      // R to mark remove start, E to mark remove end (when in remove or all mode)
      if (e.code === 'KeyR' && (mode === 'remove' || mode === 'all') && e.target === document.body) {
        e.preventDefault();
        handleMarkRemoveStart();
      }
      if (e.code === 'KeyE' && (mode === 'remove' || mode === 'all') && e.target === document.body) {
        e.preventDefault();
        handleMarkRemoveEnd();
      }

      // X for quick cut - instantly mark 1 second around current position (when in remove or all mode)
      if (e.code === 'KeyX' && (mode === 'remove' || mode === 'all') && e.target === document.body) {
        e.preventDefault();
        handleQuickCut(currentTime, 0.5);
      }

      // Delete/Backspace to remove last cut section
      if ((e.code === 'Delete' || e.code === 'Backspace') && (mode === 'remove' || mode === 'all') && e.target === document.body) {
        e.preventDefault();
        setSectionsToRemove(prev => prev.slice(0, -1));
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('keydown', handleKeyboard);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('keydown', handleKeyboard);
      document.body.style.overflow = 'unset';
    };
  }, [onClose, isProcessing, mode, currentTime, handlePlayPause, seekRelative, handleAddSplitPoint, handleMarkRemoveStart, handleMarkRemoveEnd, handleQuickCut]);

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      setEndTime(video.duration);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);

      // Loop within previewing segment or trim section
      if (previewingSegment) {
        if (video.currentTime >= previewingSegment.end) {
          video.currentTime = previewingSegment.start;
        }
      } else if (trimEnabled && video.currentTime >= endTime) {
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
  }, [startTime, endTime, trimEnabled, previewingSegment]);

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
    if (dragging || draggingSplitIndex !== null || removeDragStart !== null) return;
    const time = getPositionFromEvent(e);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  // Handle timeline mouse down for remove section drag
  const handleTimelineMouseDownForRemove = (e: React.MouseEvent) => {
    if (mode !== 'remove' && mode !== 'all') return;
    if (dragging || draggingSplitIndex !== null) return;

    // Check if clicking on an existing control (not empty timeline area)
    const target = e.target as HTMLElement;
    if (target.closest('[data-timeline-control]')) return;

    const time = getPositionFromEvent(e);
    setRemoveDragStart(time);
    setRemoveDragCurrent(time);
    e.preventDefault();
  };

  const handleTimelineMouseDown = (e: React.MouseEvent, type: 'start' | 'end' | 'playhead') => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(type);
  };

  const handleSplitPointMouseDown = (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingSplitIndex(index);
  };

  // Handle drag movements
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const time = getPositionFromEvent(e);

      if (dragging) {
        if (dragging === 'start') {
          const newStart = Math.max(0, Math.min(time, endTime - 0.5));
          setStartTime(newStart);
          setTrimEnabled(true);
        } else if (dragging === 'end') {
          const newEnd = Math.min(duration, Math.max(time, startTime + 0.5));
          setEndTime(newEnd);
          setTrimEnabled(true);
        } else if (dragging === 'playhead' && videoRef.current) {
          videoRef.current.currentTime = time;
          setCurrentTime(time);
        }
      }

      if (draggingSplitIndex !== null) {
        const minTime = 0.5;
        const maxTime = duration - 0.5;
        const clampedTime = Math.max(minTime, Math.min(maxTime, time));

        setSplitPoints(prev => {
          const newPoints = [...prev];
          newPoints[draggingSplitIndex] = clampedTime;
          return newPoints.sort((a, b) => a - b);
        });
      }

      // Handle remove section drag
      if (removeDragStart !== null) {
        setRemoveDragCurrent(time);
      }
    };

    const handleMouseUp = () => {
      // Finish remove section drag
      if (removeDragStart !== null && removeDragCurrent !== null) {
        const dragDistance = Math.abs(removeDragCurrent - removeDragStart);
        if (dragDistance >= 0.1) {
          handleAddRemoveSection(removeDragStart, removeDragCurrent);
        }
        setRemoveDragStart(null);
        setRemoveDragCurrent(null);
      }

      setDragging(null);
      setDraggingSplitIndex(null);
    };

    if (dragging || draggingSplitIndex !== null || removeDragStart !== null) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, draggingSplitIndex, startTime, endTime, duration, getPositionFromEvent, removeDragStart, removeDragCurrent, handleAddRemoveSection]);

  const handleRemoveSplitPoint = (index: number) => {
    setSplitPoints(prev => prev.filter((_, i) => i !== index));
  };

  const handlePreviewSegment = (start: number, end: number) => {
    if (!videoRef.current) return;
    setPreviewingSegment({ start, end });
    videoRef.current.currentTime = start;
    videoRef.current.play();
  };

  const handleStopPreview = () => {
    setPreviewingSegment(null);
    if (videoRef.current) {
      videoRef.current.pause();
    }
  };

  const handleApplyTrim = async () => {
    if (!trimEnabled || (startTime === 0 && endTime === duration)) {
      return;
    }

    setIsProcessing(true);
    setProcessingAction('trim');

    try {
      const response = await fetch('/api/trim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, startTime, endTime }),
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
      setProcessingAction(null);
    }
  };

  const handleApplySplit = async () => {
    if (splitPoints.length === 0) {
      return;
    }

    setIsProcessing(true);
    setProcessingAction('split');

    try {
      // If trim is enabled, use the trimmed range for split points
      const effectiveSplitPoints = trimEnabled
        ? splitPoints.filter(p => p > startTime && p < endTime)
        : splitPoints;

      const response = await fetch('/api/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, splitPoints: effectiveSplitPoints }),
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
      setProcessingAction(null);
    }
  };

  const handleApplyRemove = async () => {
    if (sectionsToRemove.length === 0) {
      return;
    }

    setIsProcessing(true);
    setProcessingAction('remove');

    try {
      const response = await fetch('/api/remove-sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, sectionsToRemove }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Remove sections failed');
      }

      const data = await response.json();
      onRemoveComplete?.(data.filename, {
        sectionsRemoved: data.stats.sectionsRemoved,
        timeRemoved: data.stats.timeRemoved,
      });
      onClose();
    } catch (error) {
      console.error('Remove sections error:', error);
      alert(error instanceof Error ? error.message : 'Failed to remove sections');
    } finally {
      setIsProcessing(false);
      setProcessingAction(null);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === modalRef.current && !isProcessing) {
      onClose();
    }
  };

  const handleResetTrim = () => {
    setStartTime(0);
    setEndTime(duration);
    setTrimEnabled(false);
  };

  const handleClearSplits = () => {
    setSplitPoints([]);
  };

  // Calculate display values
  const trimmedDuration = endTime - startTime;
  const startPercent = duration > 0 ? (startTime / duration) * 100 : 0;
  const endPercent = duration > 0 ? (endTime / duration) * 100 : 100;
  const currentPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Calculate segments from split points
  const segments = (() => {
    const effectiveStart = trimEnabled ? startTime : 0;
    const effectiveEnd = trimEnabled ? endTime : duration;
    const effectiveSplits = splitPoints.filter(p => p > effectiveStart && p < effectiveEnd);
    const allPoints = [effectiveStart, ...effectiveSplits, effectiveEnd];
    return allPoints.slice(0, -1).map((start, i) => ({
      start,
      end: allPoints[i + 1],
      duration: allPoints[i + 1] - start,
    }));
  })();

  const segmentColors = [
    { bg: 'bg-blue-500/30', solid: 'bg-blue-500', text: 'text-blue-400' },
    { bg: 'bg-green-500/30', solid: 'bg-green-500', text: 'text-green-400' },
    { bg: 'bg-purple-500/30', solid: 'bg-purple-500', text: 'text-purple-400' },
    { bg: 'bg-amber-500/30', solid: 'bg-amber-500', text: 'text-amber-400' },
    { bg: 'bg-pink-500/30', solid: 'bg-pink-500', text: 'text-pink-400' },
    { bg: 'bg-cyan-500/30', solid: 'bg-cyan-500', text: 'text-cyan-400' },
  ];

  const showTrimControls = mode === 'trim' || mode === 'all';
  const showSplitControls = mode === 'split' || mode === 'all';
  const showRemoveControls = mode === 'remove' || mode === 'all';
  const hasTrimChanges = trimEnabled && (startTime > 0 || endTime < duration);
  const hasSplitChanges = splitPoints.length > 0;
  const hasRemoveChanges = sectionsToRemove.length > 0;

  // Calculate total time that will be removed
  const totalRemoveTime = sectionsToRemove.reduce((sum, s) => sum + (s.end - s.start), 0);

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
          disabled={isProcessing}
          className="absolute -top-12 right-0 p-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          aria-label="Close editor"
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="bg-gray-900 rounded-xl overflow-hidden shadow-2xl">
          {/* Header with mode tabs */}
          <div className="px-4 py-3 bg-gray-800 border-b border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                <h3 className="text-white font-medium truncate">Edit: {videoName}</h3>
              </div>

              {/* Mode tabs */}
              <div className="flex items-center gap-1 bg-gray-700/50 rounded-lg p-1">
                <button
                  onClick={() => setMode('all')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    mode === 'all'
                      ? 'bg-indigo-500 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  All Tools
                </button>
                <button
                  onClick={() => setMode('trim')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    mode === 'trim'
                      ? 'bg-blue-500 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Trim
                </button>
                <button
                  onClick={() => setMode('split')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    mode === 'split'
                      ? 'bg-orange-500 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Split
                </button>
                <button
                  onClick={() => setMode('remove')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    mode === 'remove'
                      ? 'bg-red-500 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Remove
                </button>
              </div>
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

            {/* Preview indicator */}
            {previewingSegment && (
              <div className="absolute top-4 left-4 px-3 py-1.5 bg-indigo-500 rounded-lg text-white text-sm flex items-center gap-2">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                Previewing Segment
                <button
                  onClick={handleStopPreview}
                  className="ml-2 hover:bg-indigo-600 rounded p-0.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* Timeline Controls */}
          <div className="px-4 py-4 bg-gray-800 border-t border-gray-700">
            {/* Time display and quick actions */}
            <div className="flex items-center justify-between text-sm text-gray-400 mb-3">
              <span className="font-mono">{formatTime(currentTime)}</span>

              <div className="flex items-center gap-2">
                {showTrimControls && (
                  <span className="text-blue-400 text-xs">
                    {trimEnabled ? `Trim: ${formatTime(startTime)} - ${formatTime(endTime)}` : 'I/O to set trim'}
                  </span>
                )}
                {showSplitControls && (
                  <button
                    onClick={handleAddSplitPoint}
                    disabled={currentTime <= 0.5 || currentTime >= duration - 0.5}
                    className="px-2 py-1 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-xs rounded transition-colors flex items-center gap-1"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Split (S)
                  </button>
                )}
                {showRemoveControls && (
                  <div className="flex items-center gap-2">
                    {/* Quick Cut button */}
                    <button
                      onClick={() => handleQuickCut(currentTime, 0.5)}
                      className="px-2 py-1 bg-red-500 hover:bg-red-600 text-white text-xs rounded transition-colors flex items-center gap-1"
                      title="Mark 1 second cut around playhead (X)"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
                      </svg>
                      Quick Cut (X)
                    </button>

                    <span className="text-gray-500 text-xs">or drag on timeline</span>

                    {removeMarkStart === null ? (
                      <button
                        onClick={handleMarkRemoveStart}
                        className="px-2 py-1 bg-gray-600 hover:bg-gray-500 text-white text-xs rounded transition-colors flex items-center gap-1"
                        title="Manual: Press R to start, E to end"
                      >
                        R/E Manual
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={handleMarkRemoveEnd}
                          disabled={currentTime <= removeMarkStart}
                          className="px-2 py-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-xs rounded transition-colors flex items-center gap-1 animate-pulse"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          End Cut (E)
                        </button>
                        <button
                          onClick={() => setRemoveMarkStart(null)}
                          className="px-2 py-1 bg-gray-600 hover:bg-gray-500 text-white text-xs rounded transition-colors"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              <span className="font-mono">{formatTime(duration)}</span>
            </div>

            {/* Timeline */}
            <div
              ref={timelineRef}
              className="relative h-16 bg-gray-700 rounded-lg cursor-pointer overflow-hidden"
              onClick={handleTimelineClick}
              onMouseDown={handleTimelineMouseDownForRemove}
            >
              {/* Trim region overlay (dimmed areas outside selection) */}
              {showTrimControls && trimEnabled && (
                <>
                  <div
                    className="absolute top-0 bottom-0 left-0 bg-black/60 z-[5]"
                    style={{ width: `${startPercent}%` }}
                  />
                  <div
                    className="absolute top-0 bottom-0 right-0 bg-black/60 z-[5]"
                    style={{ width: `${100 - endPercent}%` }}
                  />
                </>
              )}

              {/* Remove sections overlay (red areas to be cut) */}
              {showRemoveControls && sectionsToRemove.map((section, index) => (
                <div
                  key={`remove-${index}`}
                  data-timeline-control="true"
                  className="absolute top-0 bottom-0 bg-red-500/40 border-x-2 border-red-500 z-[7] group cursor-pointer"
                  style={{
                    left: `${(section.start / duration) * 100}%`,
                    width: `${((section.end - section.start) / duration) * 100}%`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    // Don't remove on click, show delete button instead
                  }}
                >
                  {/* Cut indicator */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 opacity-80">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
                      </svg>
                      CUT
                    </div>
                  </div>
                  {/* Remove button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveSection(index);
                    }}
                    className="absolute -top-2 right-1 w-5 h-5 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    title="Remove this cut mark"
                  >
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}

              {/* Pending remove mark (when R is pressed but not E yet) */}
              {showRemoveControls && removeMarkStart !== null && (
                <div
                  className="absolute top-0 bottom-0 bg-red-500/20 border-l-2 border-red-500 border-dashed z-[7] animate-pulse"
                  style={{
                    left: `${(removeMarkStart / duration) * 100}%`,
                    width: `${(Math.max(0, (currentTime - removeMarkStart)) / duration) * 100}%`,
                  }}
                >
                  <div className="absolute top-1 left-1 text-[10px] text-red-400 font-medium">
                    Press E to end cut
                  </div>
                </div>
              )}

              {/* Drag selection preview for remove sections */}
              {showRemoveControls && removeDragStart !== null && removeDragCurrent !== null && (
                <div
                  className="absolute top-0 bottom-0 bg-red-500/30 border-2 border-red-500 border-dashed z-[8]"
                  style={{
                    left: `${(Math.min(removeDragStart, removeDragCurrent) / duration) * 100}%`,
                    width: `${(Math.abs(removeDragCurrent - removeDragStart) / duration) * 100}%`,
                  }}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded">
                      {formatTime(Math.abs(removeDragCurrent - removeDragStart))}
                    </div>
                  </div>
                </div>
              )}

              {/* Segment colors for splits */}
              {showSplitControls && splitPoints.length > 0 && segments.map((seg, index) => (
                <div
                  key={index}
                  className={`absolute top-0 bottom-0 ${segmentColors[index % segmentColors.length].bg} border-r border-gray-600/50`}
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

              {/* Selected trim region border */}
              {showTrimControls && trimEnabled && (
                <div
                  className="absolute top-0 bottom-0 border-y-2 border-blue-500 z-[6] pointer-events-none"
                  style={{
                    left: `${startPercent}%`,
                    width: `${endPercent - startPercent}%`,
                  }}
                />
              )}

              {/* Trim handles */}
              {showTrimControls && (
                <>
                  {/* Start handle */}
                  <div
                    data-timeline-control="true"
                    className={`absolute top-0 bottom-0 w-4 cursor-ew-resize flex items-center justify-center z-10 transition-colors ${
                      trimEnabled ? 'bg-blue-500 hover:bg-blue-400' : 'bg-gray-500 hover:bg-gray-400'
                    }`}
                    style={{ left: `calc(${startPercent}% - 8px)` }}
                    onMouseDown={(e) => handleTimelineMouseDown(e, 'start')}
                  >
                    <div className="w-0.5 h-8 bg-white/70 rounded" />
                  </div>

                  {/* End handle */}
                  <div
                    data-timeline-control="true"
                    className={`absolute top-0 bottom-0 w-4 cursor-ew-resize flex items-center justify-center z-10 transition-colors ${
                      trimEnabled ? 'bg-blue-500 hover:bg-blue-400' : 'bg-gray-500 hover:bg-gray-400'
                    }`}
                    style={{ left: `calc(${endPercent}% - 8px)` }}
                    onMouseDown={(e) => handleTimelineMouseDown(e, 'end')}
                  >
                    <div className="w-0.5 h-8 bg-white/70 rounded" />
                  </div>
                </>
              )}

              {/* Split point markers */}
              {showSplitControls && splitPoints.map((point, index) => (
                <div
                  key={index}
                  data-timeline-control="true"
                  className="absolute top-0 bottom-0 w-4 cursor-ew-resize z-[15] group"
                  style={{ left: `calc(${(point / duration) * 100}% - 8px)` }}
                  onMouseDown={(e) => handleSplitPointMouseDown(e, index)}
                >
                  {/* Split line */}
                  <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-orange-500 -translate-x-1/2" />
                  {/* Handle */}
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                    </svg>
                  </div>
                  {/* Time label */}
                  <div className="absolute left-1/2 -top-5 -translate-x-1/2 px-1.5 py-0.5 bg-orange-500 text-white text-[9px] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                    {formatTime(point)}
                  </div>
                  {/* Remove button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveSplitPoint(index);
                    }}
                    className="absolute left-1/2 -bottom-5 -translate-x-1/2 w-4 h-4 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}

              {/* Playhead */}
              <div
                data-timeline-control="true"
                className="absolute top-0 bottom-0 w-1 bg-white cursor-ew-resize z-20"
                style={{ left: `calc(${currentPercent}% - 2px)` }}
                onMouseDown={(e) => handleTimelineMouseDown(e, 'playhead')}
              >
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full shadow" />
              </div>
            </div>

            {/* Keyboard shortcuts hint */}
            <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-gray-500">
              <span><kbd className="px-1 py-0.5 bg-gray-700 rounded">Space</kbd> Play/Pause</span>
              <span><kbd className="px-1 py-0.5 bg-gray-700 rounded">←</kbd><kbd className="px-1 py-0.5 bg-gray-700 rounded">→</kbd> Seek</span>
              {showTrimControls && <span><kbd className="px-1 py-0.5 bg-gray-700 rounded">I</kbd> In <kbd className="px-1 py-0.5 bg-gray-700 rounded">O</kbd> Out</span>}
              {showSplitControls && <span><kbd className="px-1 py-0.5 bg-gray-700 rounded">S</kbd> Split</span>}
              {showRemoveControls && (
                <>
                  <span><kbd className="px-1 py-0.5 bg-gray-700 rounded">X</kbd> Quick Cut</span>
                  <span><kbd className="px-1 py-0.5 bg-gray-700 rounded">Del</kbd> Undo Last</span>
                  <span className="text-gray-600">Drag on timeline to select</span>
                </>
              )}
            </div>
          </div>

          {/* Segments Preview */}
          {showSplitControls && splitPoints.length > 0 && (
            <div className="px-4 py-3 bg-gray-800/50 border-t border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-400">Resulting segments ({segments.length}):</p>
                <button
                  onClick={handleClearSplits}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Clear all splits
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {segments.map((seg, index) => (
                  <button
                    key={index}
                    onClick={() => handlePreviewSegment(seg.start, seg.end)}
                    className={`px-3 py-1.5 rounded-lg text-xs text-white ${segmentColors[index % segmentColors.length].bg} hover:opacity-80 transition-opacity flex items-center gap-2`}
                  >
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    <span className="font-medium">Part {index + 1}</span>
                    <span className="opacity-70">{formatTime(seg.duration)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Remove Sections Preview */}
          {showRemoveControls && sectionsToRemove.length > 0 && (
            <div className="px-4 py-3 bg-red-500/10 border-t border-red-500/20">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-400">
                  Sections to remove ({sectionsToRemove.length}) - Total: <span className="text-red-400 font-medium">{formatTime(totalRemoveTime)}</span>
                </p>
                <button
                  onClick={handleClearRemoveSections}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Clear all
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {sectionsToRemove.map((section, index) => (
                  <div
                    key={index}
                    className="px-3 py-1.5 rounded-lg text-xs text-white bg-red-500/30 border border-red-500/50 flex items-center gap-2 group"
                  >
                    <svg className="w-3 h-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
                    </svg>
                    <span>{formatTime(section.start)} - {formatTime(section.end)}</span>
                    <span className="opacity-70">({formatTime(section.end - section.start)})</span>
                    <button
                      onClick={() => handleRemoveSection(index)}
                      className="ml-1 text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-gray-500 mt-2">
                New duration: {formatTime(duration - totalRemoveTime)} (removing {formatTime(totalRemoveTime)})
              </p>
            </div>
          )}

          {/* Trim Info */}
          {showTrimControls && trimEnabled && (
            <div className="px-4 py-2 bg-blue-500/10 border-t border-blue-500/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-blue-400">
                    Trimmed duration: <strong>{formatTime(trimmedDuration)}</strong>
                  </span>
                  <span className="text-gray-500">
                    (removing {formatTime(startTime)} from start, {formatTime(duration - endTime)} from end)
                  </span>
                </div>
                <button
                  onClick={handleResetTrim}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Reset trim
                </button>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="px-4 py-4 bg-gray-800 border-t border-gray-700">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-gray-400">
                {!hasTrimChanges && !hasSplitChanges && !hasRemoveChanges ? (
                  <span>Make edits using the timeline above</span>
                ) : (
                  <span className="flex items-center gap-2">
                    {hasTrimChanges && (
                      <span className="flex items-center gap-1 text-blue-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Trim ready
                      </span>
                    )}
                    {hasSplitChanges && (
                      <span className="flex items-center gap-1 text-orange-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {splitPoints.length} split{splitPoints.length > 1 ? 's' : ''} ready
                      </span>
                    )}
                    {hasRemoveChanges && (
                      <span className="flex items-center gap-1 text-red-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {sectionsToRemove.length} cut{sectionsToRemove.length > 1 ? 's' : ''} ready
                      </span>
                    )}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  disabled={isProcessing}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>

                {/* Apply Trim button */}
                {showTrimControls && hasTrimChanges && (
                  <button
                    onClick={handleApplyTrim}
                    disabled={isProcessing}
                    className="px-5 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {isProcessing && processingAction === 'trim' ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Trimming...
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
                )}

                {/* Apply Split button */}
                {showSplitControls && hasSplitChanges && (
                  <button
                    onClick={handleApplySplit}
                    disabled={isProcessing}
                    className="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {isProcessing && processingAction === 'split' ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Splitting...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                        </svg>
                        Split ({segments.length} parts)
                      </>
                    )}
                  </button>
                )}

                {/* Apply Remove button */}
                {showRemoveControls && hasRemoveChanges && (
                  <button
                    onClick={handleApplyRemove}
                    disabled={isProcessing}
                    className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white text-sm rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {isProcessing && processingAction === 'remove' ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Removing...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
                        </svg>
                        Remove Cuts ({sectionsToRemove.length})
                      </>
                    )}
                  </button>
                )}

                {/* Looks Good button when no changes */}
                {!hasTrimChanges && !hasSplitChanges && !hasRemoveChanges && (
                  <button
                    onClick={onClose}
                    className="px-5 py-2 bg-green-500 hover:bg-green-600 text-white text-sm rounded-lg font-medium transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Looks Good
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
