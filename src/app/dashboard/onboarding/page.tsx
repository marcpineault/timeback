'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { analytics } from '@/components/Analytics'

// ─── Types ──────────────────────────────────────────────────────────

type Vertical = 'MORTGAGE_BROKER' | 'FINANCIAL_ADVISOR' | 'REAL_ESTATE_AGENT' | 'OTHER'

interface FormData {
  vertical: Vertical | null
  market: string
  specialization: string
}

// ─── Constants ──────────────────────────────────────────────────────

const VERTICALS: { value: Vertical; emoji: string; label: string; disabled: boolean; comingSoon: boolean }[] = [
  { value: 'MORTGAGE_BROKER', emoji: '🏦', label: 'Mortgage Broker', disabled: false, comingSoon: false },
  { value: 'FINANCIAL_ADVISOR', emoji: '💼', label: 'Financial Advisor', disabled: true, comingSoon: true },
  { value: 'REAL_ESTATE_AGENT', emoji: '🏠', label: 'Real Estate Agent', disabled: true, comingSoon: true },
  { value: 'OTHER', emoji: '📹', label: 'Other / General', disabled: false, comingSoon: false },
]

const SPECIALIZATIONS = [
  { value: 'first_time_buyers', label: 'First-Time Buyers', audience: 'First-time home buyers' },
  { value: 'refinancing', label: 'Refinancing & Renewals', audience: 'Homeowners approaching mortgage renewal' },
  { value: 'investment', label: 'Investment Properties', audience: 'Real estate investors and property buyers' },
  { value: 'commercial', label: 'Commercial Mortgages', audience: 'Business owners and commercial property investors' },
  { value: 'self_employed', label: 'Self-Employed / Alt Lending', audience: 'Self-employed professionals and non-traditional borrowers' },
]

// ─── Component ──────────────────────────────────────────────────────

export default function VerticalOnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [initialLoading, setInitialLoading] = useState(true)
  const trackedStart = useRef(false)

  const [form, setForm] = useState<FormData>({
    vertical: null,
    market: '',
    specialization: '',
  })

  // Resume: fetch existing onboarding state so user picks up where they left off
  useEffect(() => {
    async function fetchExistingState() {
      try {
        const res = await fetch('/api/onboarding/vertical')
        if (res.ok) {
          const data = await res.json()
          if (data.verticalProfile) {
            const vp = data.verticalProfile
            setForm({
              vertical: vp.vertical as Vertical,
              market: vp.market || '',
              specialization: vp.specialization || '',
            })
            // If they have vertical + market + specialization, jump to confirmation (step 3)
            if (vp.vertical && vp.vertical !== 'OTHER' && vp.market && vp.specialization) {
              setStep(3)
            } else if (vp.vertical && vp.vertical !== 'OTHER') {
              setStep(2)
            }
          } else if (data.vertical && data.vertical !== 'OTHER') {
            // User has a vertical on their User record but no profile yet
            setForm(prev => ({ ...prev, vertical: data.vertical as Vertical }))
            setStep(2)
          } else if (!data.verticalProfile) {
            // Fresh start — track onboarding started
            if (!trackedStart.current) {
              analytics.trackVerticalOnboardingStarted()
              trackedStart.current = true
            }
          }
        }
      } catch {
        // Silently continue — start fresh
      } finally {
        setInitialLoading(false)
      }
    }
    fetchExistingState()
  }, [])

  const totalSteps = form.vertical === 'OTHER' ? 1 : 3

  // Get readable specialization label
  const specLabel = SPECIALIZATIONS.find(s => s.value === form.specialization)?.label || form.specialization
  const specAudience = SPECIALIZATIONS.find(s => s.value === form.specialization)?.audience || ''

  // Save the onboarding data
  const saveOnboarding = useCallback(async () => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/onboarding/vertical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vertical: form.vertical,
          market: form.market,
          specialization: form.specialization,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to save')
      }

      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      return false
    } finally {
      setSaving(false)
    }
  }, [form])

  // ─── Step Navigation ────────────────────────────────────────────

  const handleVerticalSelect = async (vertical: Vertical) => {
    setForm(prev => ({ ...prev, vertical }))
    analytics.trackVerticalSelected(vertical)

    if (vertical === 'OTHER') {
      // Save immediately and redirect
      setSaving(true)
      setError('')
      try {
        const res = await fetch('/api/onboarding/vertical', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vertical: 'OTHER', market: '', specialization: '' }),
        })
        if (!res.ok) throw new Error('Failed to save')
        analytics.trackVerticalOnboardingCompleted('OTHER')
        router.push('/dashboard/ideate')
      } catch {
        setError('Something went wrong. Please try again.')
        setSaving(false)
      }
    } else {
      setStep(2)
    }
  }

  const handleStep2Next = () => {
    if (!form.market.trim() || !form.specialization) return
    setStep(3)
  }

  const handleFinish = async () => {
    const success = await saveOnboarding()
    if (success) {
      analytics.trackVerticalOnboardingCompleted(
        form.vertical || '',
        form.market,
        form.specialization
      )
      router.push('/dashboard/ideate')
    }
  }

  const handleBack = () => {
    setError('')
    setStep(prev => Math.max(1, prev - 1))
  }

  // ─── Progress ──────────────────────────────────────────────────

  const progressPercent = (step / totalSteps) * 100

  return (
    <div className="landing-page min-h-screen flex flex-col">
      {/* Header */}
      <nav className="lp-nav" style={{ position: 'relative' }}>
        <Link href="/" className="nav-logo">TimeBack</Link>
      </nav>

      {/* Progress Bar */}
      <div className="w-full bg-[#e0dbd4] h-1">
        <div
          className="bg-[#e85d26] h-1 transition-all duration-500 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-2xl">
          {/* Loading state */}
          {initialLoading && (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-[#e85d26] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!initialLoading && <>
          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 mb-8">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`
                  h-2 rounded-full transition-all duration-300
                  ${i + 1 === step ? 'bg-[#e85d26] w-6' : i + 1 < step ? 'bg-[#e85d26] w-2' : 'bg-[#e0dbd4] w-2'}
                `}
              />
            ))}
          </div>

          {/* Error display */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-6 text-sm">
              {error}
            </div>
          )}

          {/* ─── Screen 1: What's your profession? ─────────────────── */}
          {step === 1 && (
            <div className="animate-fadeIn">
              <h1
                className="text-2xl sm:text-3xl font-bold text-[#0a0a0a] text-center mb-2"
                style={{ fontFamily: "'Instrument Serif', serif" }}
              >
                What&apos;s your profession?
              </h1>
              <p className="text-[#8a8580] text-center mb-8 text-sm sm:text-base">
                We&apos;ll customize your scripts, content calendar, and AI generation for your industry.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {VERTICALS.map((v) => (
                  <button
                    key={v.value}
                    onClick={() => !v.disabled && handleVerticalSelect(v.value)}
                    disabled={v.disabled || saving}
                    className={`
                      relative text-left p-5 rounded-xl border-2 transition-all duration-200
                      ${v.disabled
                        ? 'border-[#e0dbd4] bg-[#faf7f2] opacity-60 cursor-not-allowed'
                        : 'border-[#e0dbd4] bg-white hover:border-[#8a8580] hover:shadow-sm cursor-pointer'
                      }
                    `}
                  >
                    <div className="text-2xl mb-2">{v.emoji}</div>
                    <div className="font-semibold text-[#0a0a0a] text-base">{v.label}</div>
                    {v.comingSoon && (
                      <span className="inline-block mt-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-[#f5f0e8] text-[#8a8580]">
                        Coming soon
                      </span>
                    )}
                    {saving && form.vertical === v.value && (
                      <div className="absolute top-4 right-4">
                        <div className="w-5 h-5 border-2 border-[#e85d26] border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ─── Screen 2: Tell us about your practice ─────────────── */}
          {step === 2 && (
            <div className="animate-fadeIn">
              <button
                onClick={handleBack}
                className="flex items-center gap-1 text-[#8a8580] hover:text-[#0a0a0a] text-sm mb-6 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>

              <h1
                className="text-2xl sm:text-3xl font-bold text-[#0a0a0a] text-center mb-2"
                style={{ fontFamily: "'Instrument Serif', serif" }}
              >
                Tell us about your practice
              </h1>
              <p className="text-[#8a8580] text-center mb-8 text-sm sm:text-base">
                This helps us pick the best scripts and content ideas for you.
              </p>

              {/* Market */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-[#0a0a0a] mb-2">
                  What market do you serve?
                </label>
                <input
                  type="text"
                  placeholder="e.g. Toronto, ON"
                  value={form.market}
                  onChange={(e) => setForm(prev => ({ ...prev, market: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-[#e0dbd4] bg-white text-[#0a0a0a] placeholder-[#8a8580] focus:outline-none focus:border-[#e85d26] focus:ring-1 focus:ring-[#e85d26] transition-colors text-sm"
                />
              </div>

              {/* Specialization */}
              <div className="mb-8">
                <label className="block text-sm font-semibold text-[#0a0a0a] mb-2">
                  What&apos;s your specialization?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SPECIALIZATIONS.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => setForm(prev => ({ ...prev, specialization: s.value }))}
                      className={`
                        text-left px-4 py-3 rounded-xl border transition-all text-sm
                        ${form.specialization === s.value
                          ? 'border-[#e85d26] bg-[rgba(232,93,38,0.04)] text-[#0a0a0a] font-medium'
                          : 'border-[#e0dbd4] bg-white text-[#0a0a0a] hover:border-[#8a8580]'
                        }
                      `}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Continue button */}
              <button
                onClick={handleStep2Next}
                disabled={!form.market.trim() || !form.specialization}
                className="w-full py-3 rounded-full bg-[#e85d26] hover:bg-[#d14d1a] disabled:bg-[#e0dbd4] disabled:cursor-not-allowed text-white font-semibold transition-colors"
              >
                Continue
              </button>
            </div>
          )}

          {/* ─── Screen 3: Almost done! (Summary + Save) ───────────── */}
          {step === 3 && (
            <div className="animate-fadeIn">
              <button
                onClick={handleBack}
                className="flex items-center gap-1 text-[#8a8580] hover:text-[#0a0a0a] text-sm mb-6 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>

              <h1
                className="text-2xl sm:text-3xl font-bold text-[#0a0a0a] text-center mb-2"
                style={{ fontFamily: "'Instrument Serif', serif" }}
              >
                Almost done!
              </h1>
              <p className="text-[#8a8580] text-center mb-8 text-sm sm:text-base max-w-lg mx-auto">
                We&apos;ll customize your scripts, content calendar, and AI generation for mortgage brokers
                in <strong className="text-[#0a0a0a]">{form.market}</strong> specializing
                in <strong className="text-[#0a0a0a]">{specLabel.toLowerCase()}</strong>.
              </p>

              {/* Summary card */}
              <div className="bg-white border border-[#e0dbd4] rounded-2xl p-5 sm:p-6 mb-6">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-[rgba(232,93,38,0.1)] flex items-center justify-center flex-shrink-0">
                      <span className="text-sm">📝</span>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-[#0a0a0a]">Pre-written scripts</div>
                      <div className="text-xs text-[#8a8580]">12 ready-to-record scripts for mortgage brokers</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-[rgba(232,93,38,0.1)] flex items-center justify-center flex-shrink-0">
                      <span className="text-sm">📅</span>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-[#0a0a0a]">Content calendar</div>
                      <div className="text-xs text-[#8a8580]">Monthly content ideas including BoC rate reactions</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-[rgba(232,93,38,0.1)] flex items-center justify-center flex-shrink-0">
                      <span className="text-sm">🤖</span>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-[#0a0a0a]">AI tuned for you</div>
                      <div className="text-xs text-[#8a8580]">
                        Profile pre-filled for {specAudience ? specAudience.toLowerCase() : 'your audience'} in {form.market}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={handleFinish}
                disabled={saving}
                className="w-full py-3 rounded-full bg-[#e85d26] hover:bg-[#d14d1a] disabled:bg-[#e0dbd4] disabled:cursor-not-allowed text-white font-semibold transition-colors flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Setting up...
                  </>
                ) : (
                  <>Set Up My Profile &rarr;</>
                )}
              </button>
            </div>
          )}
          </>}
        </div>
      </div>
    </div>
  )
}
