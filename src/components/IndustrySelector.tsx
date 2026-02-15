'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'

interface ScriptExample {
  cat: string
  title: string
}

interface IndustryInfo {
  eyebrow: string
  headline: string
  body: string
  link: string
  painChips: string[]
  scripts: ScriptExample[]
}

const INDUSTRY_DATA: Record<string, { emoji: string; title: string; hook: string; info: IndustryInfo }> = {
  realtors: {
    emoji: '🏡',
    title: 'Real Estate Agent',
    hook: 'Become the local expert people call first',
    info: {
      eyebrow: 'TimeBack for Real Estate Agents',
      headline: 'The agent who shows up in their feed gets the listing.',
      body: 'Become the local market expert. Post neighborhood guides, market updates, and buyer tips — all from one Sunday recording session.',
      link: '/real-estate-agents',
      painChips: ['No time between showings', 'Videos stuck in camera roll', 'Zillow owns your leads'],
      scripts: [
        { cat: 'Market Update', title: "Here's what happened in [City] real estate this month" },
        { cat: 'Buyer Tips', title: '3 mistakes first-time buyers make (and how to avoid them)' },
        { cat: 'Neighborhood', title: 'Living in [Neighborhood]: the honest truth' },
        { cat: 'Seller Strategy', title: 'Thinking of selling? Do these 5 things first' },
      ],
    },
  },
  'financial-advisors': {
    emoji: '💼',
    title: 'Financial Advisor',
    hook: 'Build trust before the first meeting',
    info: {
      eyebrow: 'TimeBack for Financial Advisors',
      headline: 'Your prospects Google you before they call. What do they find?',
      body: 'Build trust with prospects before the first meeting. Post educational content about retirement, taxes, and financial planning — scripted by AI, posted on autopilot.',
      link: '/financial-advisors',
      painChips: ['No time between clients', "Can't afford an agency", 'Inconsistent posting'],
      scripts: [
        { cat: 'Trust Building', title: '5 questions to ask any financial advisor before hiring them' },
        { cat: 'Education', title: 'Roth IRA vs. Traditional — explained in 60 seconds' },
        { cat: 'Seasonal', title: '3 tax moves to make before December 31st' },
        { cat: 'Myth Busting', title: "No, you don't need $500K to work with an advisor" },
      ],
    },
  },
  'insurance-agents': {
    emoji: '🛡️',
    title: 'Insurance Agent',
    hook: 'Stop cold calling, start showing up',
    info: {
      eyebrow: 'TimeBack for Insurance Agents',
      headline: 'Stop cold calling. Start showing up in their feed.',
      body: "The agents winning right now aren't competing on rates — they're competing on trust. Post educational content that makes people call you.",
      link: '/insurance-agents',
      painChips: ['Cold leads getting colder', 'Competing on price', 'No content system'],
      scripts: [
        { cat: 'Education', title: '5 things your renters insurance actually covers' },
        { cat: 'Life Events', title: 'Just bought a house? 3 insurance moves to make this week' },
        { cat: 'Claims Tips', title: 'What to do in the first 24 hours after a car accident' },
        { cat: 'Myth Busting', title: "No, your car insurance doesn't cover everything" },
      ],
    },
  },
  'mortgage-brokers': {
    emoji: '🏦',
    title: 'Mortgage Broker',
    hook: 'Win clients before they compare rates',
    info: {
      eyebrow: 'TimeBack for Mortgage Brokers',
      headline: 'Win the client before they ever compare rates.',
      body: 'Build trust with borrowers AND referral partners through consistent, educational video content. Realtors refer the LO they see the most.',
      link: '/mortgage-brokers',
      painChips: ["Rates aren't your edge", 'Agents forget you', 'Borrowers ghost after pre-qual'],
      scripts: [
        { cat: 'Education', title: "What's actually in your monthly mortgage payment?" },
        { cat: 'Rate Talk', title: "Rates dropped this week — here's what that means for you" },
        { cat: 'Myth Busting', title: "You don't need 20% down to buy a house" },
        { cat: 'Agent Facing', title: 'Why your clients keep losing offers (and how to fix it)' },
      ],
    },
  },
  lawyers: {
    emoji: '⚖️',
    title: 'Lawyer',
    hook: 'Demystify your expertise, get referrals',
    info: {
      eyebrow: 'TimeBack for Lawyers',
      headline: 'People hire lawyers they trust. Let them see you first.',
      body: 'Demystify your expertise with 60-second educational videos. Build an organic pipeline that costs less than one Google Ads click.',
      link: '/lawyers',
      painChips: ["Legal directories aren't enough", 'PPC costs $100+/click', 'Billable hours come first'],
      scripts: [
        { cat: 'Personal Injury', title: "The insurance company called. Here's what NOT to say." },
        { cat: 'Family Law', title: 'Filing for divorce? 5 things to do this week.' },
        { cat: 'Estate Planning', title: "Why your online will probably won't hold up" },
        { cat: 'Criminal Defense', title: 'Pulled over? Know your rights in 60 seconds.' },
      ],
    },
  },
  'side-hustlers': {
    emoji: '🚀',
    title: 'Side Hustler',
    hook: 'Build your audience before you quit your job',
    info: {
      eyebrow: 'TimeBack for Side Hustlers',
      headline: 'Build your audience before you quit your job.',
      body: "You've got the expertise and the idea — just not the time. TimeBack turns your Sunday afternoon into a month of content that builds your brand while you're at your day job.",
      link: '/side-hustlers',
      painChips: ['Maybe 2 free hours a week', 'Starting from zero', 'Editing is the bottleneck'],
      scripts: [
        { cat: 'Authority', title: "I spent 8 years in corporate. Here's what they don't teach you." },
        { cat: 'Behind the Scenes', title: 'Building a business before 8am and after 6pm' },
        { cat: 'Quick Wins', title: 'Do this one thing today and see results by Friday' },
        { cat: 'Myth Busting', title: "You don't need 10K followers to make money online" },
      ],
    },
  },
}

const INDUSTRY_KEYS = Object.keys(INDUSTRY_DATA)

export default function IndustrySelector() {
  const [selected, setSelected] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)

  const handleSelect = (key: string) => {
    if (selected === key) {
      setSelected(null)
      setIsOpen(false)
    } else {
      setSelected(key)
      setIsOpen(true)
    }
  }

  useEffect(() => {
    if (isOpen && previewRef.current) {
      const timeout = setTimeout(() => {
        previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 100)
      return () => clearTimeout(timeout)
    }
  }, [isOpen, selected])

  const data = selected ? INDUSTRY_DATA[selected] : null

  return (
    <section className="lp-selector" id="selector">
      <div className="section-label">Built for Experts, Not Influencers</div>
      <h2>What do you do?</h2>
      <p className="selector-sub">Pick your industry and see exactly how TimeBack works for people like you.</p>

      <div className="selector-grid">
        {INDUSTRY_KEYS.map((key) => {
          const industry = INDUSTRY_DATA[key]
          const isActive = selected === key
          return (
            <button
              key={key}
              className={`selector-card${isActive ? ' active' : ''}`}
              onClick={() => handleSelect(key)}
              type="button"
            >
              {isActive && (
                <span className="selector-check">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3.5 7L6 9.5L10.5 4.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              )}
              <span className="selector-card-top-bar" />
              <span className="selector-emoji">{industry.emoji}</span>
              <span className="selector-title">{industry.title}</span>
              <span className="selector-hook">{industry.hook}</span>
            </button>
          )
        })}
      </div>

      <div
        ref={previewRef}
        className={`selector-preview${isOpen && data ? ' open' : ''}`}
      >
        {data && (
          <div className="selector-preview-inner">
            <div className="selector-preview-left">
              <div className="selector-eyebrow">{data.info.eyebrow}</div>
              <h3 className="selector-headline">{data.info.headline}</h3>
              <p className="selector-body">{data.info.body}</p>
              <div className="selector-chips">
                {data.info.painChips.map((chip) => (
                  <span key={chip} className="selector-chip">{chip}</span>
                ))}
              </div>
              <Link href={data.info.link} className="selector-cta">
                See my full page →
              </Link>
            </div>
            <div className="selector-preview-right">
              <div className="selector-scripts-label">AI-generated script ideas</div>
              <div className="selector-scripts">
                {data.info.scripts.map((script) => (
                  <div key={script.title} className="selector-script-card">
                    <span className="selector-script-cat">{script.cat}</span>
                    <span className="selector-script-title">{script.title}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
