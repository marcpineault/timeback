'use client'

import { useState, useEffect } from 'react'
import CreatorProfile from '@/components/ideate/CreatorProfile'
import IdeaGenerator from '@/components/ideate/IdeaGenerator'
import ScriptList from '@/components/ideate/ScriptList'
import ScriptView from '@/components/ideate/ScriptView'
import Teleprompter from '@/components/ideate/Teleprompter'
import SwipeFile from '@/components/ideate/SwipeFile'
import { useCreatorProfile, useScripts, useScript, type ScriptData } from '@/hooks/useIdeate'

type Tab = 'ideas' | 'scripts' | 'swipefile' | 'teleprompter' | 'profile'

interface DashboardProps {
  ideateUsed: number
  ideateLimit: number | null
  plan: string
}

export default function IdeateDashboard({ ideateUsed, ideateLimit, plan }: DashboardProps) {
  const { profile, loading: profileLoading, refetch: refetchProfile } = useCreatorProfile()
  const { scripts, loading: scriptsLoading, refetch: refetchScripts } = useScripts()
  const [activeTab, setActiveTab] = useState<Tab>('ideas')
  const [activeScriptId, setActiveScriptId] = useState<string | null>(null)
  const [viewingScript, setViewingScript] = useState<ScriptData | null>(null)
  const { script: teleprompterScript, loading: scriptLoading } = useScript(activeScriptId)

  // Force profile tab if profile is incomplete
  useEffect(() => {
    if (!profileLoading && (!profile || !profile.isComplete)) {
      setActiveTab('profile')
    }
  }, [profile, profileLoading])

  function handleOpenTeleprompter(script: ScriptData) {
    setActiveScriptId(script.id)
    setActiveTab('teleprompter')
  }

  function handleViewScript(script: ScriptData) {
    setViewingScript(script)
  }

  function handleBackToList() {
    setViewingScript(null)
    refetchScripts()
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'ideas', label: 'Ideas' },
    { id: 'scripts', label: 'Scripts' },
    { id: 'swipefile', label: 'Inspiration' },
    { id: 'teleprompter', label: 'Teleprompter' },
    { id: 'profile', label: 'Profile' },
  ]

  const isLoading = profileLoading

  // Generation counter calculations
  const genUsagePercent = ideateLimit ? Math.min((ideateUsed / ideateLimit) * 100, 100) : 0
  const genRemaining = ideateLimit ? Math.max(0, ideateLimit - ideateUsed) : null

  return (
    <div>
      {/* Page Title */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-[#0a0a0a]" style={{ fontFamily: "'Instrument Serif', serif" }}>Ideate</h1>
        <p className="text-[#8a8580] text-sm mt-1">
          Generate video ideas and scripts powered by the SPCL framework
        </p>
      </div>

      {/* Generation Counter Banner */}
      {ideateLimit !== null && (
        <div className="bg-white border border-[#e0dbd4] rounded-2xl p-4 mb-6">
          <div className="flex items-center gap-4">
            {/* Progress Ring */}
            <div className="flex-shrink-0">
              <svg width="48" height="48" viewBox="0 0 48 48">
                <circle
                  cx="24" cy="24" r="20"
                  fill="none"
                  strokeWidth="4"
                  className="progress-ring-bg"
                />
                <circle
                  cx="24" cy="24" r="20"
                  fill="none"
                  strokeWidth="4"
                  className="progress-ring-fill"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 20}`}
                  strokeDashoffset={`${2 * Math.PI * 20 * (1 - genUsagePercent / 100)}`}
                />
                <text
                  x="24" y="24"
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="11"
                  fontWeight="600"
                  fill="#0a0a0a"
                >
                  {ideateUsed}
                </text>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-[#0a0a0a]">
                  {ideateUsed} / {ideateLimit} generations used
                </p>
                {genRemaining !== null && genRemaining > 0 && (
                  <span className="text-xs text-[#8a8580]">{genRemaining} remaining</span>
                )}
              </div>
              <div className="w-full bg-[#e0dbd4] rounded-full h-1.5">
                <div
                  className="bg-[#e85d26] h-1.5 rounded-full transition-all"
                  style={{ width: `${genUsagePercent}%` }}
                />
              </div>
            </div>
            {ideateUsed >= ideateLimit && (
              <a
                href="/pricing"
                className="px-3 py-1.5 bg-[#e85d26] hover:bg-[#d14d1a] text-[#0a0a0a] rounded-full text-xs font-medium transition-colors flex-shrink-0"
              >
                Upgrade
              </a>
            )}
            {ideateUsed < ideateLimit && plan === 'FREE' && (
              <a
                href="/pricing"
                className="text-[#e85d26] hover:text-[#d14d1a] text-xs transition-colors flex-shrink-0"
              >
                Upgrade
              </a>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white border border-[#e0dbd4] rounded-full p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id)
              if (tab.id !== 'scripts') setViewingScript(null)
            }}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-[#e85d26] text-[#0a0a0a]'
                : 'text-[#8a8580] hover:text-[#0a0a0a]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {isLoading ? (
        <div className="space-y-4">
          <div className="bg-white border border-[#e0dbd4] rounded-2xl p-6">
            <div className="skeleton skeleton-text w-48 h-6 mb-3" />
            <div className="skeleton skeleton-text w-full h-4 mb-2" />
            <div className="skeleton skeleton-text w-3/4 h-4 mb-6" />
            <div className="skeleton w-full h-32 rounded-xl" />
          </div>
        </div>
      ) : (
        <>
          {activeTab === 'ideas' && (
            profile?.isComplete ? (
              <IdeaGenerator
                onScriptGenerated={(script) => {
                  setViewingScript(script)
                  setActiveTab('scripts')
                  refetchScripts()
                }}
              />
            ) : (
              <div className="bg-white border border-[#e0dbd4] rounded-2xl p-8 sm:p-12 text-center">
                {/* Illustration */}
                <div className="w-20 h-20 mx-auto mb-6 bg-[rgba(232,93,38,0.08)] rounded-full flex items-center justify-center">
                  <svg className="w-10 h-10 text-[#e85d26]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-[#0a0a0a] mb-2" style={{ fontFamily: "'Instrument Serif', serif" }}>
                  Your content ideas are one profile away
                </h2>
                <p className="text-[#8a8580] text-sm mb-6 max-w-md mx-auto">
                  Tell us your niche, audience, and style — we&apos;ll generate scroll-stopping video ideas tailored to you.
                </p>
                <button
                  onClick={() => setActiveTab('profile')}
                  className="px-6 py-2.5 bg-[#e85d26] hover:bg-[#d14d1a] text-[#0a0a0a] rounded-full text-sm font-medium transition-colors"
                >
                  Set Up Profile
                </button>

                {/* Preview mockup */}
                <div className="mt-8 max-w-sm mx-auto">
                  <p className="text-xs text-[#8a8580] mb-3 uppercase tracking-wider font-medium">What you&apos;ll get</p>
                  <div className="bg-[#f5f0e8] border border-[#e0dbd4] rounded-xl p-4 text-left space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 bg-[rgba(232,93,38,0.1)] rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-[#e85d26] text-xs font-bold">1</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[#0a0a0a]">AI-powered video ideas</p>
                        <p className="text-xs text-[#8a8580]">Tailored to your niche and audience</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 bg-[rgba(232,93,38,0.1)] rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-[#e85d26] text-xs font-bold">2</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[#0a0a0a]">Ready-to-film scripts</p>
                        <p className="text-xs text-[#8a8580]">Complete with hooks and CTAs</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 bg-[rgba(232,93,38,0.1)] rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-[#e85d26] text-xs font-bold">3</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[#0a0a0a]">Built-in teleprompter</p>
                        <p className="text-xs text-[#8a8580]">Read your script while recording</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          )}

          {activeTab === 'scripts' && (
            viewingScript ? (
              <ScriptView
                script={viewingScript}
                onBack={handleBackToList}
                onOpenTeleprompter={handleOpenTeleprompter}
                onScriptUpdated={(updated) => setViewingScript(updated)}
              />
            ) : (
              <ScriptList
                scripts={scripts}
                loading={scriptsLoading}
                onViewScript={handleViewScript}
                onOpenTeleprompter={handleOpenTeleprompter}
                onRefresh={refetchScripts}
              />
            )
          )}

          {activeTab === 'swipefile' && (
            profile?.isComplete ? (
              <SwipeFile
                onUseAsIdea={() => {
                  setActiveTab('ideas')
                }}
              />
            ) : (
              <div className="bg-white border border-[#e0dbd4] rounded-2xl p-8 sm:p-12 text-center">
                <div className="w-20 h-20 mx-auto mb-6 bg-[rgba(232,93,38,0.08)] rounded-full flex items-center justify-center">
                  <svg className="w-10 h-10 text-[#e85d26]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-[#0a0a0a] mb-2" style={{ fontFamily: "'Instrument Serif', serif" }}>
                  Build your inspiration library
                </h2>
                <p className="text-[#8a8580] text-sm mb-6 max-w-md mx-auto">
                  We need your niche and audience info to find relevant content patterns and trending topics.
                </p>
                <button
                  onClick={() => setActiveTab('profile')}
                  className="px-6 py-2.5 bg-[#e85d26] hover:bg-[#d14d1a] text-[#0a0a0a] rounded-full text-sm font-medium transition-colors"
                >
                  Set Up Profile
                </button>
              </div>
            )
          )}

          {activeTab === 'teleprompter' && (
            teleprompterScript ? (
              <Teleprompter
                script={teleprompterScript}
                onClose={() => {
                  setActiveScriptId(null)
                  setActiveTab('scripts')
                }}
              />
            ) : (
              <div className="text-center py-12">
                <p className="text-[#8a8580] mb-2">No script selected</p>
                <p className="text-[#8a8580] text-sm mb-4">
                  Generate a script from the Ideas tab, then open it in the teleprompter.
                </p>
                {scripts.length > 0 && (
                  <div className="mt-6">
                    <p className="text-[#8a8580] text-sm mb-3">Or pick a recent script:</p>
                    <div className="flex flex-col items-center gap-2">
                      {scripts.slice(0, 3).map((s) => (
                        <button
                          key={s.id}
                          onClick={() => handleOpenTeleprompter(s)}
                          className="text-[#e85d26] hover:text-[#d14d1a] text-sm"
                        >
                          {s.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          )}

          {activeTab === 'profile' && (
            <CreatorProfile
              profile={profile}
              onSaved={() => {
                refetchProfile()
              }}
            />
          )}
        </>
      )}
    </div>
  )
}
