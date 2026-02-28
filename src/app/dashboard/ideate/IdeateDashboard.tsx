'use client'

import { useState, useEffect } from 'react'
import CreatorProfile from '@/components/ideate/CreatorProfile'
import IdeaGenerator from '@/components/ideate/IdeaGenerator'
import ScriptList from '@/components/ideate/ScriptList'
import ScriptView from '@/components/ideate/ScriptView'
import ScriptTemplates from '@/components/ideate/ScriptTemplates'
import ContentCalendar from '@/components/ideate/ContentCalendar'
import Research from '@/components/ideate/Research'
import { useCreatorProfile, useScripts, type ScriptData } from '@/hooks/useIdeate'
import UpgradeBanner from '@/components/upgrade/UpgradeBanner'
import UsageWarningBanner from '@/components/upgrade/UsageWarningBanner'

type Tab = 'ideas' | 'templates' | 'scripts' | 'calendar' | 'research' | 'profile'

interface DashboardProps {
  ideateUsed: number
  ideateLimit: number | null
  plan: string
  vertical?: string | null
  hasInstagram: boolean
}

export default function IdeateDashboard({ ideateUsed, ideateLimit, plan, vertical, hasInstagram }: DashboardProps) {
  const { profile, loading: profileLoading, refetch: refetchProfile } = useCreatorProfile()
  const { scripts, loading: scriptsLoading, refetch: refetchScripts } = useScripts()
  const [activeTab, setActiveTab] = useState<Tab>('ideas')
  const [viewingScript, setViewingScript] = useState<ScriptData | null>(null)

  // Force profile tab if profile is incomplete
  useEffect(() => {
    if (!profileLoading && (!profile || !profile.isComplete)) {
      setActiveTab('profile')
    }
  }, [profile, profileLoading])

  // Cross-tab navigation state (calendar → templates with category, calendar → ideas with topic)
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState<string | null>(null)
  const [initialIdeaTopic, setInitialIdeaTopic] = useState<string | null>(null)

  function handleViewScript(script: ScriptData) {
    setViewingScript(script)
  }

  function handleBackToList() {
    setViewingScript(null)
    refetchScripts()
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'ideas', label: 'Ideas' },
    { id: 'templates', label: 'Templates' },
    { id: 'scripts', label: 'Scripts' },
    { id: 'calendar', label: 'Calendar' },
    { id: 'research', label: 'Research' },
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
                  className={`h-1.5 rounded-full transition-all ${
                    genUsagePercent >= 100 ? 'bg-red-500' :
                    genUsagePercent >= 80 ? 'bg-amber-500' :
                    genUsagePercent >= 60 ? 'bg-[#e85d26]' :
                    'bg-green-500'
                  }`}
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

      {/* Usage warning for FREE users approaching limit */}
      {plan === 'FREE' && ideateLimit !== null && genUsagePercent >= 80 && genUsagePercent < 100 && genRemaining !== null && (
        <UsageWarningBanner
          remaining={genRemaining}
          resource="ideate_generations"
          used={ideateUsed}
          limit={ideateLimit}
          plan={plan}
        />
      )}

      {/* Upgrade banner at 80%+ usage */}
      {plan === 'FREE' && ideateLimit !== null && genUsagePercent >= 80 && (
        <UpgradeBanner
          context="usage_warning"
          plan={plan}
          ideateUsed={ideateUsed}
          ideateLimit={ideateLimit}
          location="ideate"
          dismissKey="tb_upgrade_dismissed_ideate_usage"
        />
      )}

      {/* Tabs */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 mb-6">
        <div className="flex gap-1 bg-white border border-[#e0dbd4] rounded-full p-1 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id)
                if (tab.id !== 'scripts') setViewingScript(null)
              }}
              className={`px-3 sm:px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-[#e85d26] text-[#0a0a0a]'
                  : 'text-[#8a8580] hover:text-[#0a0a0a]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
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
                initialTopic={initialIdeaTopic}
                vertical={vertical}
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
                        <p className="text-sm font-medium text-[#0a0a0a]">Content calendar</p>
                        <p className="text-xs text-[#8a8580]">Plan and schedule your content</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          )}

          {activeTab === 'templates' && (
            <ScriptTemplates
              onScriptSaved={refetchScripts}
              initialCategory={templateCategoryFilter}
            />
          )}

          {activeTab === 'scripts' && (
            viewingScript ? (
              <ScriptView
                script={viewingScript}
                onBack={handleBackToList}
                onScriptUpdated={(updated) => setViewingScript(updated)}
              />
            ) : (
              <ScriptList
                scripts={scripts}
                loading={scriptsLoading}
                onViewScript={handleViewScript}
                onRefresh={refetchScripts}
              />
            )
          )}

          {activeTab === 'calendar' && (
            <ContentCalendar
              onNavigateToTemplates={(category) => {
                setTemplateCategoryFilter(category)
                setActiveTab('templates')
              }}
              onNavigateToIdeas={(topic) => {
                setInitialIdeaTopic(topic)
                setActiveTab('ideas')
              }}
            />
          )}

          {activeTab === 'research' && (
            profile?.isComplete ? (
              <Research
                onUseAsIdea={() => {
                  setActiveTab('ideas')
                }}
                hasInstagram={hasInstagram}
              />
            ) : (
              <div className="bg-white border border-[#e0dbd4] rounded-2xl p-8 sm:p-12 text-center">
                <div className="w-20 h-20 mx-auto mb-6 bg-[rgba(232,93,38,0.08)] rounded-full flex items-center justify-center">
                  <svg className="w-10 h-10 text-[#e85d26]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-[#0a0a0a] mb-2" style={{ fontFamily: "'Instrument Serif', serif" }}>
                  Research top-performing videos
                </h2>
                <p className="text-[#8a8580] text-sm mb-6 max-w-md mx-auto">
                  Complete your creator profile first so we can analyze competitor videos and adapt their hooks for your niche.
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
