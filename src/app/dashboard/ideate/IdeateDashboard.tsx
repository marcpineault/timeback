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

export default function IdeateDashboard() {
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
    { id: 'swipefile', label: 'Swipe File' },
    { id: 'teleprompter', label: 'Teleprompter' },
    { id: 'profile', label: 'Profile' },
  ]

  const isLoading = profileLoading

  return (
    <div>
      {/* Page Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Ideate</h1>
        <p className="text-gray-500 text-sm mt-1">
          Generate video ideas and scripts powered by the SPCL framework
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-[#1A1A24] rounded-lg p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id)
              if (tab.id !== 'scripts') setViewingScript(null)
            }}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-violet-500 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {isLoading ? (
        <div className="text-gray-500 text-center py-12">Loading...</div>
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
              <div className="text-center py-12">
                <p className="text-gray-400 mb-2">Complete your creator profile first</p>
                <p className="text-gray-500 text-sm mb-4">
                  We need to know about you to generate ideas tailored to your niche.
                </p>
                <button
                  onClick={() => setActiveTab('profile')}
                  className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Set Up Profile
                </button>
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
              <div className="text-center py-12">
                <p className="text-gray-400 mb-2">Complete your creator profile first</p>
                <p className="text-gray-500 text-sm mb-4">
                  We need your niche and audience info to find relevant content patterns.
                </p>
                <button
                  onClick={() => setActiveTab('profile')}
                  className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white rounded-lg text-sm font-medium transition-colors"
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
                <p className="text-gray-400 mb-2">No script selected</p>
                <p className="text-gray-500 text-sm mb-4">
                  Generate a script from the Ideas tab, then open it in the teleprompter.
                </p>
                {scripts.length > 0 && (
                  <div className="mt-6">
                    <p className="text-gray-400 text-sm mb-3">Or pick a recent script:</p>
                    <div className="flex flex-col items-center gap-2">
                      {scripts.slice(0, 3).map((s) => (
                        <button
                          key={s.id}
                          onClick={() => handleOpenTeleprompter(s)}
                          className="text-cyan-400 hover:text-cyan-300 text-sm"
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
