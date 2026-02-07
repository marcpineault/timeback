'use client'

import { useState, useTransition } from 'react'
import { completeOnboarding } from '@/app/actions/onboarding'

interface WelcomeOverlayProps {
  isNewUser: boolean
}

export default function WelcomeOverlay({ isNewUser }: WelcomeOverlayProps) {
  const [visible, setVisible] = useState(isNewUser)
  const [, startTransition] = useTransition()

  if (!visible) return null

  function dismiss() {
    setVisible(false)
    startTransition(() => {
      completeOnboarding()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="bg-[#1A1A24] rounded-2xl max-w-2xl w-full p-6 sm:p-10 text-center">
        {/* Heading */}
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
          Welcome to TimeBack!
        </h1>
        <p className="text-gray-400 text-sm sm:text-base mb-8 max-w-md mx-auto">
          Upload a video and we&apos;ll automatically remove the silence, filler words, and dead air. Ready in minutes.
        </p>

        {/* Two CTA cards */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          {/* Card A — Watch Tutorials */}
          <a
            href="https://www.youtube.com/playlist?list=PLhATaQNX0bxMeX0e8AA-TSk8L0g3t-QX7"
            target="_blank"
            rel="noopener noreferrer"
            onClick={dismiss}
            className="flex-1 group border border-gray-700 hover:border-indigo-500 bg-[#12121A] rounded-xl p-6 transition-colors cursor-pointer"
          >
            {/* Play icon */}
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-indigo-500/20 flex items-center justify-center group-hover:bg-indigo-500/30 transition-colors">
              <svg
                className="w-7 h-7 text-indigo-400"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <h2 className="text-white font-semibold text-lg mb-1">
              Watch How It Works
            </h2>
            <p className="text-gray-500 text-sm">
              2-minute walkthrough
            </p>
          </a>

          {/* Card B — Upload First Video */}
          <button
            onClick={dismiss}
            className="flex-1 group border border-gray-700 hover:border-violet-500 bg-[#12121A] rounded-xl p-6 transition-colors cursor-pointer text-left"
          >
            {/* Upload icon */}
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-violet-500/20 flex items-center justify-center group-hover:bg-violet-500/30 transition-colors">
              <svg
                className="w-7 h-7 text-violet-400"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0-12L8 8m4-4l4 4"
                />
              </svg>
            </div>
            <h2 className="text-white font-semibold text-lg mb-1 text-center">
              Upload Your First Video
            </h2>
            <p className="text-gray-500 text-sm text-center">
              Drag &amp; drop or click to upload
            </p>
          </button>
        </div>

        {/* Skip link */}
        <button
          onClick={dismiss}
          className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
        >
          Skip for now
        </button>
      </div>
    </div>
  )
}
