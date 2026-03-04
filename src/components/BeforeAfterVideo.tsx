'use client'

import { useRef, useState, useCallback, useEffect } from 'react'

export default function BeforeAfterVideo() {
  const beforeRef = useRef<HTMLVideoElement>(null)
  const afterRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [beforeLoaded, setBeforeLoaded] = useState(false)
  const [afterLoaded, setAfterLoaded] = useState(false)

  const bothLoaded = beforeLoaded && afterLoaded

  const togglePlay = useCallback(() => {
    const before = beforeRef.current
    const after = afterRef.current
    if (!before || !after) return

    if (playing) {
      before.pause()
      after.pause()
      setPlaying(false)
    } else {
      // Sync start times
      after.currentTime = before.currentTime
      before.play()
      after.play()
      setPlaying(true)
    }
  }, [playing])

  // When either video ends, pause both
  useEffect(() => {
    const before = beforeRef.current
    const after = afterRef.current
    if (!before || !after) return

    const handleEnded = () => {
      before.pause()
      after.pause()
      before.currentTime = 0
      after.currentTime = 0
      setPlaying(false)
    }

    before.addEventListener('ended', handleEnded)
    after.addEventListener('ended', handleEnded)
    return () => {
      before.removeEventListener('ended', handleEnded)
      after.removeEventListener('ended', handleEnded)
    }
  }, [])

  return (
    <section className="lp-before-after reveal">
      <div className="section-label">See the Difference</div>
      <h2>Hours of editing. Gone in seconds.</h2>
      <p>Upload your unedited recording — TimeBack removes silences, tightens cuts, and adds captions automatically.</p>

      <div className="ba-container">
        <div className="ba-video-wrap">
          <div className="ba-label ba-label-before">Before</div>
          <div className="ba-player">
            <video
              ref={beforeRef}
              src="/demo-before.mp4"
              playsInline
              muted
              preload="metadata"
              onCanPlayThrough={() => setBeforeLoaded(true)}
            />
            {!beforeLoaded && (
              <div className="ba-placeholder">
                <div className="ba-placeholder-icon">🎥</div>
                <span>Raw footage</span>
              </div>
            )}
          </div>
          <div className="ba-caption">Raw recording with pauses &amp; dead air</div>
        </div>

        <div className="ba-arrow">→</div>

        <div className="ba-video-wrap">
          <div className="ba-label ba-label-after">After</div>
          <div className="ba-player">
            <video
              ref={afterRef}
              src="/demo-after.mp4"
              playsInline
              muted
              preload="metadata"
              onCanPlayThrough={() => setAfterLoaded(true)}
            />
            {!afterLoaded && (
              <div className="ba-placeholder">
                <div className="ba-placeholder-icon">✨</div>
                <span>Polished result</span>
              </div>
            )}
          </div>
          <div className="ba-caption">Clean, captioned &amp; ready to post</div>
        </div>
      </div>

      {bothLoaded && (
        <button className="ba-play-btn" onClick={togglePlay}>
          {playing ? '⏸ Pause Both' : '▶ Play Both'}
        </button>
      )}
    </section>
  )
}
