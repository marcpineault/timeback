'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import type { ScriptData } from '@/hooks/useIdeate'

interface Props {
  script: ScriptData
  onClose: () => void
}

export default function Teleprompter({ script, onClose }: Props) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(130) // WPM
  const [fontSize, setFontSize] = useState(28)
  const [isMirrored, setIsMirrored] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number | null>(null)
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTimeRef = useRef<number>(0)

  const lines = script.fullScript.split('\n').filter((line) => line.trim())

  // Calculate scroll speed: pixels per second based on WPM
  const lineHeight = fontSize * 1.8
  const pixelsPerSecond = (speed / 60) * lineHeight * 0.4

  // Auto-scroll animation
  useEffect(() => {
    if (!isPlaying || !scrollRef.current) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
      return
    }

    lastTimeRef.current = performance.now()

    function animate(now: number) {
      const delta = (now - lastTimeRef.current) / 1000
      lastTimeRef.current = now

      if (scrollRef.current) {
        scrollRef.current.scrollTop += pixelsPerSecond * delta
      }

      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
    }
  }, [isPlaying, pixelsPerSecond])

  // Auto-hide controls
  const resetControlsTimer = useCallback(() => {
    setShowControls(true)
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current)
    controlsTimerRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false)
    }, 3000)
  }, [isPlaying])

  useEffect(() => {
    resetControlsTimer()
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current)
    }
  }, [resetControlsTimer])

  // Keyboard controls
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === ' ' || e.key === 'k') {
        e.preventDefault()
        setIsPlaying((p) => !p)
      } else if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowUp') {
        setSpeed((s) => Math.min(s + 10, 200))
        resetControlsTimer()
      } else if (e.key === 'ArrowDown') {
        setSpeed((s) => Math.max(s - 10, 60))
        resetControlsTimer()
      } else if (e.key === '+' || e.key === '=') {
        setFontSize((s) => Math.min(s + 2, 48))
        resetControlsTimer()
      } else if (e.key === '-') {
        setFontSize((s) => Math.max(s - 2, 18))
        resetControlsTimer()
      } else if (e.key === 'm') {
        setIsMirrored((m) => !m)
        resetControlsTimer()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, resetControlsTimer])

  function handleReset() {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
    setIsPlaying(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-[#faf7f2]"
      style={{ transform: isMirrored ? 'scaleX(-1)' : 'none' }}
      onMouseMove={resetControlsTimer}
      onTouchStart={resetControlsTimer}
    >
      {/* Script text container */}
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto px-6 sm:px-16 lg:px-32"
        style={{ scrollBehavior: 'auto' }}
      >
        {/* Top padding - text starts below center */}
        <div style={{ height: '40vh' }} />

        {lines.map((line, i) => (
          <p
            key={i}
            className="text-[#0a0a0a] mb-4 transition-opacity max-w-3xl mx-auto"
            style={{
              fontSize: `${fontSize}px`,
              lineHeight: 1.8,
            }}
          >
            {line === '[PAUSE]' ? (
              <span className="block text-[#e85d26] italic text-center" style={{ fontSize: `${fontSize * 0.6}px` }}>
                — pause —
              </span>
            ) : (
              line
            )}
          </p>
        ))}

        {/* Bottom padding - text can scroll past */}
        <div style={{ height: '70vh' }} />
      </div>

      {/* Controls overlay */}
      <div
        className={`fixed bottom-0 left-0 right-0 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{ transform: isMirrored ? 'scaleX(-1)' : 'none' }}
      >
        <div className="bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-16 pb-6 px-6">
          <div className="max-w-2xl mx-auto">
            {/* Speed slider */}
            <div className="flex items-center gap-3 mb-4">
              <span className="text-[#8a8580] text-xs w-16">Speed</span>
              <input
                type="range"
                min={60}
                max={200}
                value={speed}
                onChange={(e) => setSpeed(parseInt(e.target.value))}
                className="flex-1 accent-[#e85d26]"
              />
              <span className="text-[#0a0a0a] text-xs w-16 text-right">{speed} WPM</span>
            </div>

            {/* Control buttons */}
            <div className="flex items-center justify-center gap-3">
              {/* Reset */}
              <button
                onClick={handleReset}
                className="p-2.5 bg-[#f5f0e8] hover:bg-[#e0dbd4] text-[#0a0a0a] rounded-full transition-colors"
                title="Reset to start"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>

              {/* Play/Pause */}
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="p-3 bg-[#e85d26] hover:bg-[#d14d1a] text-[#0a0a0a] rounded-2xl transition-colors"
                title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              >
                {isPlaying ? (
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              {/* Font size */}
              <button
                onClick={() => setFontSize((s) => Math.max(s - 2, 18))}
                className="p-2.5 bg-[#f5f0e8] hover:bg-[#e0dbd4] text-[#0a0a0a] rounded-full transition-colors"
                title="Smaller text (-)"
              >
                <span className="text-sm font-bold">A-</span>
              </button>
              <button
                onClick={() => setFontSize((s) => Math.min(s + 2, 48))}
                className="p-2.5 bg-[#f5f0e8] hover:bg-[#e0dbd4] text-[#0a0a0a] rounded-full transition-colors"
                title="Larger text (+)"
              >
                <span className="text-sm font-bold">A+</span>
              </button>

              {/* Mirror */}
              <button
                onClick={() => setIsMirrored(!isMirrored)}
                className={`p-2.5 rounded-full transition-colors ${
                  isMirrored
                    ? 'bg-[rgba(232,93,38,0.1)] text-[#e85d26]'
                    : 'bg-[#f5f0e8] hover:bg-[#e0dbd4] text-[#0a0a0a]'
                }`}
                title="Mirror mode (M)"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </button>

              {/* Close */}
              <button
                onClick={onClose}
                className="p-2.5 bg-[#f5f0e8] hover:bg-red-500/20 hover:text-red-400 text-[#0a0a0a] rounded-full transition-colors"
                title="Exit (Esc)"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Keyboard shortcuts hint */}
            <p className="text-[#8a8580] text-xs text-center mt-3">
              Space: play/pause &middot; Arrows: speed &middot; +/-: font &middot; M: mirror &middot; Esc: exit
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
