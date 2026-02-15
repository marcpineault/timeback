import Link from 'next/link'

const INDUSTRY_DATA: Record<string, { emoji: string; title: string; hook: string; link: string }> = {
  realtors: {
    emoji: '🏡',
    title: 'Real Estate Agent',
    hook: 'Become the local expert people call first',
    link: '/real-estate-agents',
  },
  'financial-advisors': {
    emoji: '💼',
    title: 'Financial Advisor',
    hook: 'Build trust before the first meeting',
    link: '/financial-advisors',
  },
  'insurance-agents': {
    emoji: '🛡️',
    title: 'Insurance Agent',
    hook: 'Stop cold calling, start showing up',
    link: '/insurance-agents',
  },
  'mortgage-brokers': {
    emoji: '🏦',
    title: 'Mortgage Broker',
    hook: 'Win clients before they compare rates',
    link: '/mortgage-brokers',
  },
  lawyers: {
    emoji: '⚖️',
    title: 'Lawyer',
    hook: 'Demystify your expertise, get referrals',
    link: '/lawyers',
  },
  'side-hustlers': {
    emoji: '🚀',
    title: 'Side Hustler',
    hook: 'Build your audience before you quit your job',
    link: '/side-hustlers',
  },
  'health-practitioners': {
    emoji: '🩺',
    title: 'Health Practitioner',
    hook: 'Fill your schedule with patients who trust you',
    link: '/health-practitioners',
  },
}

const INDUSTRY_KEYS = Object.keys(INDUSTRY_DATA)

export default function IndustrySelector() {
  return (
    <section className="lp-selector" id="selector">
      <div className="section-label">Built for Experts, Not Influencers</div>
      <h2>What do you do?</h2>
      <p className="selector-sub">Pick your industry and see exactly how TimeBack works for people like you.</p>

      <div className="selector-grid">
        {INDUSTRY_KEYS.map((key) => {
          const industry = INDUSTRY_DATA[key]
          return (
            <Link
              key={key}
              href={industry.link}
              className="selector-card"
            >
              <span className="selector-card-top-bar" />
              <span className="selector-emoji">{industry.emoji}</span>
              <span className="selector-title">{industry.title}</span>
              <span className="selector-hook">{industry.hook}</span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
