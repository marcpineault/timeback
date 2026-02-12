'use client'

import { useState, type KeyboardEvent } from 'react'
import type { CreatorProfile as CreatorProfileType } from '@/hooks/useIdeate'

interface Props {
  profile: CreatorProfileType | null
  onSaved: () => void
}

const TONE_OPTIONS = [
  { value: 'direct', label: 'Direct & No-nonsense' },
  { value: 'casual', label: 'Casual & Conversational' },
  { value: 'motivational', label: 'Motivational & Energetic' },
  { value: 'educational', label: 'Educational & Methodical' },
  { value: 'witty', label: 'Witty & Humorous' },
]

const PLATFORM_OPTIONS = [
  { value: 'instagram', label: 'Instagram Reels' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube-shorts', label: 'YouTube Shorts' },
  { value: 'youtube', label: 'YouTube (long form)' },
]

export default function CreatorProfile({ profile, onSaved }: Props) {
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Step 1: Identity
  const [niche, setNiche] = useState(profile?.niche ?? '')
  const [targetAudience, setTargetAudience] = useState(profile?.targetAudience ?? '')
  const [contentGoal, setContentGoal] = useState(profile?.contentGoal ?? '')
  const [primaryPlatform, setPrimaryPlatform] = useState(profile?.primaryPlatform ?? 'instagram')
  const [typicalVideoLength, setTypicalVideoLength] = useState(profile?.typicalVideoLength ?? 60)

  // Step 2: SPCL
  const [statusProof, setStatusProof] = useState<string[]>(profile?.statusProof ?? [])
  const [powerExamples, setPowerExamples] = useState<string[]>(profile?.powerExamples ?? [])
  const [credibilityMarkers, setCredibilityMarkers] = useState<string[]>(profile?.credibilityMarkers ?? [])
  const [likenessTraits, setLikenessTraits] = useState<string[]>(profile?.likenessTraits ?? [])

  // Step 3: Voice
  const [toneOfVoice, setToneOfVoice] = useState(profile?.toneOfVoice ?? 'direct')
  const [personalCatchphrases, setPersonalCatchphrases] = useState<string[]>(profile?.personalCatchphrases ?? [])
  const [avoidTopics, setAvoidTopics] = useState<string[]>(profile?.avoidTopics ?? [])
  const [exampleScripts, setExampleScripts] = useState<string[]>(profile?.exampleScripts ?? [])

  async function handleSave() {
    setSaving(true)
    setSaved(false)

    try {
      const res = await fetch('/api/ideate/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          niche,
          targetAudience,
          contentGoal,
          primaryPlatform,
          typicalVideoLength,
          statusProof,
          powerExamples,
          credibilityMarkers,
          likenessTraits,
          toneOfVoice,
          personalCatchphrases,
          avoidTopics,
          exampleScripts: exampleScripts.filter(Boolean),
        }),
      })

      if (res.ok) {
        setSaved(true)
        onSaved()
        setTimeout(() => setSaved(false), 2000)
      }
    } catch (err) {
      console.error('Failed to save profile:', err)
    } finally {
      setSaving(false)
    }
  }

  const isStep1Valid = niche.trim() && targetAudience.trim()

  return (
    <div className="max-w-2xl">
      {/* Progress */}
      <div className="flex items-center gap-2 mb-6">
        {[1, 2, 3].map((s) => (
          <button
            key={s}
            onClick={() => setStep(s)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              step === s
                ? 'bg-violet-500 text-white'
                : s < step || (s === 1 && isStep1Valid)
                  ? 'bg-violet-500/20 text-violet-400'
                  : 'bg-[#2A2A3A] text-gray-500'
            }`}
          >
            {s}. {s === 1 ? 'Identity' : s === 2 ? 'SPCL Framework' : 'Voice & Style'}
          </button>
        ))}
      </div>

      {/* Step 1: Identity */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="bg-[#1A1A24] rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-1">Your Identity</h2>
            <p className="text-gray-500 text-sm mb-6">Tell us about you and your content goals.</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Niche *</label>
                <input
                  type="text"
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  placeholder="e.g. SaaS founders, real estate investing, fitness for busy professionals"
                  className="w-full bg-[#2A2A3A] border border-gray-700 text-white rounded-lg px-4 py-3 text-sm placeholder-gray-500 focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Target Audience *</label>
                <input
                  type="text"
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder="e.g. Entrepreneurs doing $1M-$10M/year who want to scale"
                  className="w-full bg-[#2A2A3A] border border-gray-700 text-white rounded-lg px-4 py-3 text-sm placeholder-gray-500 focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Content Goal</label>
                <input
                  type="text"
                  value={contentGoal}
                  onChange={(e) => setContentGoal(e.target.value)}
                  placeholder="e.g. Generate leads for my agency, build personal brand"
                  className="w-full bg-[#2A2A3A] border border-gray-700 text-white rounded-lg px-4 py-3 text-sm placeholder-gray-500 focus:outline-none focus:border-violet-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Platform</label>
                  <select
                    value={primaryPlatform}
                    onChange={(e) => setPrimaryPlatform(e.target.value)}
                    className="w-full bg-[#2A2A3A] border border-gray-700 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-violet-500"
                  >
                    {PLATFORM_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Video Length (sec)</label>
                  <input
                    type="number"
                    value={typicalVideoLength}
                    onChange={(e) => setTypicalVideoLength(parseInt(e.target.value) || 60)}
                    min={15}
                    max={600}
                    className="w-full bg-[#2A2A3A] border border-gray-700 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-violet-500"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => setStep(2)}
              disabled={!isStep1Valid}
              className="px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
            >
              Next: SPCL Framework
            </button>
          </div>
        </div>
      )}

      {/* Step 2: SPCL Framework */}
      {step === 2 && (
        <div className="space-y-4">
          <SPCLSection
            title="Status"
            subtitle="What results have you achieved? What scarce resources do you control?"
            placeholder="e.g. Built a $2M agency in 18 months"
            items={statusProof}
            onItemsChange={setStatusProof}
            color="cyan"
          />
          <SPCLSection
            title="Power"
            subtitle="What frameworks or step-by-step processes do you teach that lead to results?"
            placeholder="e.g. My 5-step cold outreach system that books 20 calls/week"
            items={powerExamples}
            onItemsChange={setPowerExamples}
            color="violet"
          />
          <SPCLSection
            title="Credibility"
            subtitle="What external validation do you have? Press features, client count, certifications?"
            placeholder="e.g. Featured in Forbes, 500+ clients served"
            items={credibilityMarkers}
            onItemsChange={setCredibilityMarkers}
            color="amber"
          />
          <SPCLSection
            title="Likeness"
            subtitle="What makes you relatable? Personal details your audience connects with."
            placeholder="e.g. College dropout, dad of 3, started from zero"
            items={likenessTraits}
            onItemsChange={setLikenessTraits}
            color="green"
          />

          <div className="flex justify-between">
            <button
              onClick={() => setStep(1)}
              className="px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              className="px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Next: Voice & Style
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Voice & Style */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="bg-[#1A1A24] rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-1">Voice & Style</h2>
            <p className="text-gray-500 text-sm mb-6">How you sound and what to include or avoid.</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Tone of Voice</label>
                <select
                  value={toneOfVoice}
                  onChange={(e) => setToneOfVoice(e.target.value)}
                  className="w-full bg-[#2A2A3A] border border-gray-700 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-violet-500"
                >
                  {TONE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <ChipInput
                label="Catchphrases"
                placeholder="Type a catchphrase and press Enter"
                items={personalCatchphrases}
                onItemsChange={setPersonalCatchphrases}
              />

              <ChipInput
                label="Topics to Avoid"
                placeholder="Type a topic and press Enter"
                items={avoidTopics}
                onItemsChange={setAvoidTopics}
              />

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Example Scripts (paste scripts you like, up to 3)
                </label>
                {[0, 1, 2].map((i) => (
                  <textarea
                    key={i}
                    value={exampleScripts[i] || ''}
                    onChange={(e) => {
                      const updated = [...exampleScripts]
                      updated[i] = e.target.value
                      setExampleScripts(updated)
                    }}
                    placeholder={`Example script ${i + 1} (optional)`}
                    rows={3}
                    className="w-full bg-[#2A2A3A] border border-gray-700 text-white rounded-lg px-4 py-3 text-sm placeholder-gray-500 focus:outline-none focus:border-violet-500 mb-2 resize-none"
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => setStep(2)}
              className="px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !isStep1Valid}
              className="px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Profile'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── SPCL Section Component ──────────────────────────────────────────

function SPCLSection({
  title,
  subtitle,
  placeholder,
  items,
  onItemsChange,
  color,
}: {
  title: string
  subtitle: string
  placeholder: string
  items: string[]
  onItemsChange: (items: string[]) => void
  color: string
}) {
  const colorMap: Record<string, string> = {
    cyan: 'text-cyan-400 border-cyan-500/30',
    violet: 'text-violet-400 border-violet-500/30',
    amber: 'text-amber-400 border-amber-500/30',
    green: 'text-green-400 border-green-500/30',
  }
  const chipBgMap: Record<string, string> = {
    cyan: 'bg-cyan-500/10 text-cyan-400',
    violet: 'bg-violet-500/10 text-violet-400',
    amber: 'bg-amber-500/10 text-amber-400',
    green: 'bg-green-500/10 text-green-400',
  }

  return (
    <div className={`bg-[#1A1A24] rounded-xl p-6 border ${colorMap[color]?.split(' ')[1] || 'border-gray-800'}`}>
      <h3 className={`text-base font-semibold ${colorMap[color]?.split(' ')[0] || 'text-white'} mb-1`}>
        {title}
      </h3>
      <p className="text-gray-500 text-sm mb-4">{subtitle}</p>

      <ChipInput
        placeholder={placeholder}
        items={items}
        onItemsChange={onItemsChange}
        chipClassName={chipBgMap[color]}
      />
    </div>
  )
}

// ─── Chip Input Component ────────────────────────────────────────────

function ChipInput({
  label,
  placeholder,
  items,
  onItemsChange,
  chipClassName,
}: {
  label?: string
  placeholder: string
  items: string[]
  onItemsChange: (items: string[]) => void
  chipClassName?: string
}) {
  const [inputValue, setInputValue] = useState('')

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault()
      onItemsChange([...items, inputValue.trim()])
      setInputValue('')
    }
  }

  function removeItem(index: number) {
    onItemsChange(items.filter((_, i) => i !== index))
  }

  return (
    <div>
      {label && <label className="block text-sm font-medium text-gray-300 mb-1.5">{label}</label>}

      {items.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {items.map((item, i) => (
            <span
              key={i}
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm ${chipClassName || 'bg-violet-500/10 text-violet-400'}`}
            >
              {item}
              <button
                onClick={() => removeItem(i)}
                className="ml-1 hover:opacity-70"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full bg-[#2A2A3A] border border-gray-700 text-white rounded-lg px-4 py-3 text-sm placeholder-gray-500 focus:outline-none focus:border-violet-500"
      />
    </div>
  )
}
