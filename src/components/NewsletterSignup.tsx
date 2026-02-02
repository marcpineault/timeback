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
    <section className="py-16 sm:py-24 px-4 bg-[#1A1A24]/50">
      <div className="max-w-xl mx-auto text-center">
        <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
          Stay in the Loop
        </h2>
        <p className="text-gray-400 text-lg mb-8">
          Get updates on new features and tips for faster video editing.
        </p>

        {status === 'idle' || status === 'loading' ? (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full sm:w-auto sm:min-w-[300px] px-4 py-3 bg-[#0F0F14] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
            />
            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 disabled:opacity-70 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-all hover:scale-105 shadow-lg shadow-violet-500/25"
            >
              {status === 'loading' ? 'Please wait...' : 'Join Waitlist'}
            </button>
          </form>
        ) : status === 'success' ? (
          <div className="flex flex-col items-center gap-4">
            <p className="text-green-400 text-lg">Thanks! We&apos;ll be in touch!</p>
            <button
              onClick={handleReset}
              className="text-gray-400 hover:text-white hover:underline transition-colors"
            >
              &larr; Back
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <p className="text-red-400">{errorMessage}</p>
            <button
              onClick={handleReset}
              className="text-gray-400 hover:text-white hover:underline transition-colors"
            >
              &larr; Back
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
