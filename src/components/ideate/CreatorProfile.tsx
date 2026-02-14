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
                ? 'bg-[#e85d26] text-[#0a0a0a]'
                : s < step || (s === 1 && isStep1Valid)
                  ? 'bg-[rgba(232,93,38,0.1)] text-[#e85d26]'
                  : 'bg-[#f5f0e8] text-[#8a8580]'
            }`}
          >
            {s}. {s === 1 ? 'Identity' : s === 2 ? 'SPCL Framework' : 'Voice & Style'}
          </button>
        ))}
      </div>

      {/* Step 1: Identity */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="bg-white border border-[#e0dbd4] rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-[#0a0a0a] mb-1">Your Identity</h2>
            <p className="text-[#8a8580] text-sm mb-6">Tell us about you and your content goals.</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#0a0a0a] mb-1.5">Niche *</label>
                <input
                  type="text"
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  placeholder="e.g. SaaS founders, real estate investing, fitness for busy professionals"
                  className="w-full bg-[#f5f0e8] border border-[#e0dbd4] text-[#0a0a0a] rounded-full px-4 py-3 text-sm placeholder-[#8a8580] focus:outline-none focus:border-[#e85d26]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#0a0a0a] mb-1.5">Target Audience *</label>
                <input
                  type="text"
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder="e.g. Entrepreneurs doing $1M-$10M/year who want to scale"
                  className="w-full bg-[#f5f0e8] border border-[#e0dbd4] text-[#0a0a0a] rounded-full px-4 py-3 text-sm placeholder-[#8a8580] focus:outline-none focus:border-[#e85d26]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#0a0a0a] mb-1.5">Content Goal</label>
                <input
                  type="text"
                  value={contentGoal}
                  onChange={(e) => setContentGoal(e.target.value)}
                  placeholder="e.g. Generate leads for my agency, build personal brand"
                  className="w-full bg-[#f5f0e8] border border-[#e0dbd4] text-[#0a0a0a] rounded-full px-4 py-3 text-sm placeholder-[#8a8580] focus:outline-none focus:border-[#e85d26]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#0a0a0a] mb-1.5">Platform</label>
                  <select
                    value={primaryPlatform}
                    onChange={(e) => setPrimaryPlatform(e.target.value)}
                    className="w-full bg-[#f5f0e8] border border-[#e0dbd4] text-[#0a0a0a] rounded-full px-4 py-3 text-sm focus:outline-none focus:border-[#e85d26]"
                  >
                    {PLATFORM_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#0a0a0a] mb-1.5">Video Length (sec)</label>
                  <input
                    type="number"
                    value={typicalVideoLength}
                    onChange={(e) => setTypicalVideoLength(parseInt(e.target.value) || 60)}
                    min={15}
                    max={600}
                    className="w-full bg-[#f5f0e8] border border-[#e0dbd4] text-[#0a0a0a] rounded-full px-4 py-3 text-sm focus:outline-none focus:border-[#e85d26]"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => setStep(2)}
              disabled={!isStep1Valid}
              className="px-6 py-2.5 bg-[#e85d26] hover:bg-[#d14d1a] disabled:opacity-50 disabled:cursor-not-allowed text-[#0a0a0a] rounded-full text-sm font-medium transition-colors"
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
            subtitle="What results have you achieved? Even small wins count!"
            placeholder="e.g. Helped 50 clients, grew my account to 10K followers"
            items={statusProof}
            onItemsChange={setStatusProof}
            color="cyan"
          />
          <SPCLSection
            title="Power"
            subtitle="What useful methods or advice do you share? What's your unique approach?"
            placeholder="e.g. My morning routine that boosted productivity, a simple budgeting method"
            items={powerExamples}
            onItemsChange={setPowerExamples}
            color="violet"
          />
          <SPCLSection
            title="Credibility"
            subtitle="What makes people trust you? Experience, testimonials, or certifications all count."
            placeholder="e.g. 5 years of experience, certified coach, great client feedback"
            items={credibilityMarkers}
            onItemsChange={setCredibilityMarkers}
            color="amber"
          />
          <SPCLSection
            title="Likeness"
            subtitle="What makes you human and relatable? The real stuff people connect with."
            placeholder="e.g. Self-taught, working parent, failed twice before this worked"
            items={likenessTraits}
            onItemsChange={setLikenessTraits}
            color="green"
          />

          <div className="flex justify-between">
            <button
              onClick={() => setStep(1)}
              className="px-4 py-2 text-[#8a8580] hover:text-[#0a0a0a] text-sm transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              className="px-6 py-2.5 bg-[#e85d26] hover:bg-[#d14d1a] text-[#0a0a0a] rounded-full text-sm font-medium transition-colors"
            >
              Next: Voice & Style
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Voice & Style */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="bg-white border border-[#e0dbd4] rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-[#0a0a0a] mb-1">Voice & Style</h2>
            <p className="text-[#8a8580] text-sm mb-6">How you sound and what to include or avoid.</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#0a0a0a] mb-1.5">Tone of Voice</label>
                <select
                  value={toneOfVoice}
                  onChange={(e) => setToneOfVoice(e.target.value)}
                  className="w-full bg-[#f5f0e8] border border-[#e0dbd4] text-[#0a0a0a] rounded-full px-4 py-3 text-sm focus:outline-none focus:border-[#e85d26]"
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
                <label className="block text-sm font-medium text-[#0a0a0a] mb-1.5">
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
                    className="w-full bg-[#f5f0e8] border border-[#e0dbd4] text-[#0a0a0a] rounded-full px-4 py-3 text-sm placeholder-[#8a8580] focus:outline-none focus:border-[#e85d26] mb-2 resize-none"
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => setStep(2)}
              className="px-4 py-2 text-[#8a8580] hover:text-[#0a0a0a] text-sm transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !isStep1Valid}
              className="px-6 py-2.5 bg-[#e85d26] hover:bg-[#d14d1a] disabled:opacity-50 text-[#0a0a0a] rounded-full text-sm font-medium transition-colors"
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
    violet: 'text-[#e85d26] border-[#e85d26]/30',
    amber: 'text-amber-400 border-amber-500/30',
    green: 'text-green-400 border-green-500/30',
  }
  const chipBgMap: Record<string, string> = {
    cyan: 'bg-cyan-500/10 text-cyan-400',
    violet: 'bg-[rgba(232,93,38,0.1)] text-[#e85d26]',
    amber: 'bg-amber-500/10 text-amber-400',
    green: 'bg-green-500/10 text-green-400',
  }

  return (
    <div className={`bg-white border border-[#e0dbd4] rounded-2xl p-6 border ${colorMap[color]?.split(' ')[1] || 'border-[#e0dbd4]'}`}>
      <h3 className={`text-base font-semibold ${colorMap[color]?.split(' ')[0] || 'text-[#0a0a0a]'} mb-1`}>
        {title}
      </h3>
      <p className="text-[#8a8580] text-sm mb-4">{subtitle}</p>

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
      {label && <label className="block text-sm font-medium text-[#0a0a0a] mb-1.5">{label}</label>}

      {items.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {items.map((item, i) => (
            <span
              key={i}
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm ${chipClassName || 'bg-[rgba(232,93,38,0.1)] text-[#e85d26]'}`}
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
        className="w-full bg-[#f5f0e8] border border-[#e0dbd4] text-[#0a0a0a] rounded-full px-4 py-3 text-sm placeholder-[#8a8580] focus:outline-none focus:border-[#e85d26]"
      />
    </div>
  )
}
