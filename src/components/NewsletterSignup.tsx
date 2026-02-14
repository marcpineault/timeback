'use client'

import { useState, FormEvent } from 'react'

export default function NewsletterSignup() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    // Rate limiting check
    const timestamp = Date.now()
    const previousTimestamp = localStorage.getItem('loops-form-timestamp')

    if (previousTimestamp && Number(previousTimestamp) + 60000 > timestamp) {
      setStatus('error')
      setErrorMessage('Too many signups, please try again in a little while')
      return
    }

    localStorage.setItem('loops-form-timestamp', String(timestamp))
    setStatus('loading')

    const formBody = 'userGroup=&mailingLists=&email=' + encodeURIComponent(email)

    try {
      const res = await fetch('https://app.loops.so/api/newsletter-form/cml47e5xl08i40izqog3waq9t', {
        method: 'POST',
        body: formBody,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })

      if (res.ok) {
        setStatus('success')
        setEmail('')
      } else {
        const data = await res.json()
        setStatus('error')
        setErrorMessage(data.message || res.statusText)
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'Failed to fetch') {
        setStatus('error')
        setErrorMessage('Too many signups, please try again in a little while')
      } else {
        setStatus('error')
        setErrorMessage(error instanceof Error ? error.message : 'Oops! Something went wrong, please try again')
      }
      localStorage.setItem('loops-form-timestamp', '')
    }
  }

  const handleReset = () => {
    setStatus('idle')
    setErrorMessage('')
  }

  return (
    <section className="py-16 sm:py-24 px-4 bg-white border border-[#e0dbd4]">
      <div className="max-w-xl mx-auto text-center">
        <h2 className="text-3xl sm:text-4xl font-bold text-[#0a0a0a] mb-4">
          Get Content Growth Tips
        </h2>
        <p className="text-[#8a8580] text-lg mb-8">
          Get weekly tips on growing your authority through consistent content — plus be first to know about new features.
        </p>

        {status === 'idle' || status === 'loading' ? (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full sm:w-auto sm:min-w-[300px] px-4 py-3 bg-[#faf7f2] border border-[#e0dbd4] rounded-2xl text-[#0a0a0a] placeholder-[#8a8580] focus:outline-none focus:border-[#e85d26] focus:ring-1 focus:ring-[#e85d26] transition-colors"
            />
            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full sm:w-auto px-6 py-3 bg-[#e85d26] hover:bg-[#d14d1a] disabled:opacity-70 disabled:cursor-not-allowed text-white rounded-full font-semibold transition-all hover:scale-105 shadow-lg shadow-[#e85d26]/25"
            >
              {status === 'loading' ? 'Please wait...' : 'Join Waitlist'}
            </button>
          </form>
        ) : status === 'success' ? (
          <div className="flex flex-col items-center gap-4">
            <p className="text-green-400 text-lg">Thanks! We&apos;ll be in touch!</p>
            <button
              onClick={handleReset}
              className="text-[#8a8580] hover:text-[#0a0a0a] hover:underline transition-colors"
            >
              &larr; Back
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <p className="text-red-400">{errorMessage}</p>
            <button
              onClick={handleReset}
              className="text-[#8a8580] hover:text-[#0a0a0a] hover:underline transition-colors"
            >
              &larr; Back
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
