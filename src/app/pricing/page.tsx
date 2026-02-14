import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import { PLANS } from '@/lib/plans'
import { getOrCreateUser } from '@/lib/user'

export default async function PricingPage() {
  const { userId } = await auth()
  let currentPlan = 'FREE'

  if (userId) {
    const user = await getOrCreateUser()
    if (user) {
      currentPlan = user.plan
    }
  }

  return (
    <div className="landing-page min-h-screen">
      {/* Header */}
      <nav className="lp-nav">
        <Link href="/" className="nav-logo">TimeBack</Link>
        <div className="nav-links">
          <a href="https://www.youtube.com/playlist?list=PLhATaQNX0bxMeX0e8AA-TSk8L0g3t-QX7" target="_blank" rel="noopener noreferrer">Tutorials</a>
          {userId ? (
            <Link href="/dashboard" className="nav-cta">Dashboard</Link>
          ) : (
            <>
              <Link href="/sign-up" className="nav-cta">Start Free</Link>
            </>
          )}
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-8 sm:py-16" style={{ paddingTop: '5rem' }}>
        <div className="text-center mb-8 sm:mb-12">
          {/* Promotion Banner */}
          <div className="inline-flex items-center gap-2 px-4 py-2 mb-4 sm:mb-6 bg-[rgba(232,93,38,0.08)] border border-[#e85d26]/30 rounded-full">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#e85d26] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#e85d26]"></span>
            </span>
            <span className="text-[#e85d26] text-sm sm:text-base font-semibold">50% OFF all plans — This week only!</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-bold text-[#0a0a0a] mb-3 sm:mb-4" style={{ fontFamily: "'Instrument Serif', serif" }}>Simple, Transparent Pricing</h1>
          <p className="text-[#8a8580] text-base sm:text-lg">Start free. Upgrade when you need more.</p>
          <p className="text-green-600 text-sm sm:text-base mt-2 flex items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            30-day money-back guarantee on all paid plans
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 max-w-6xl mx-auto">
          {/* Free Plan */}
          <div className={`bg-white border border-[#e0dbd4] rounded-2xl p-4 sm:p-6 ${currentPlan === 'FREE' ? 'border-2 border-[#e85d26]' : ''}`}>
            {currentPlan === 'FREE' && (
              <span className="inline-block px-3 py-1 bg-[rgba(232,93,38,0.1)] text-[#e85d26] text-xs font-medium rounded-full mb-4">
                Current Plan
              </span>
            )}
            <h3 className="text-xl font-semibold text-[#0a0a0a] mb-2">{PLANS.FREE.name}</h3>
            <div className="mb-4">
              <span className="text-4xl font-bold text-[#0a0a0a]">$0</span>
              <span className="text-[#8a8580]">/month</span>
            </div>
            <ul className="space-y-3 mb-6">
              {PLANS.FREE.features.map((feature, i) => (
                <li key={i} className="flex items-center gap-2 text-[#0a0a0a]">
                  <svg className="w-5 h-5 text-[#e85d26] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>
            {userId ? (
              currentPlan === 'FREE' ? (
                <span className="block w-full text-center py-3 bg-[#f5f0e8] text-[#0a0a0a] rounded-full">
                  Current Plan
                </span>
              ) : (
                <span className="block w-full text-center py-3 bg-[#f5f0e8] text-[#0a0a0a] rounded-full">
                  Downgrade
                </span>
              )
            ) : (
              <Link
                href="/sign-up"
                className="block w-full text-center py-3 bg-[#f5f0e8] text-[#0a0a0a] hover:bg-[#e0dbd4] rounded-full font-medium transition-colors"
              >
                Get Started
              </Link>
            )}
          </div>

          {/* Pro Plan */}
          <div className={`bg-white border rounded-2xl p-4 sm:p-6 border-2 border-[#e85d26] relative`}>
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-[#e85d26] text-white text-xs font-medium rounded-full">
              Most Popular
            </span>
            {currentPlan === 'PRO' && (
              <span className="inline-block px-3 py-1 bg-[rgba(232,93,38,0.1)] text-[#e85d26] text-xs font-medium rounded-full mb-4">
                Current Plan
              </span>
            )}
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-xl font-semibold text-[#0a0a0a]">{PLANS.PRO.name}</h3>
              <span className="px-2 py-0.5 bg-[rgba(232,93,38,0.1)] text-[#e85d26] text-xs font-bold rounded-full">50% OFF</span>
            </div>
            <div className="mb-4">
              <span className="text-lg text-[#8a8580] line-through mr-2">${PLANS.PRO.price}</span>
              <span className="text-4xl font-bold text-[#0a0a0a]">${(PLANS.PRO.price / 2).toFixed(2).replace(/\.00$/, '')}</span>
              <span className="text-[#8a8580]">/month</span>
            </div>
            <ul className="space-y-3 mb-6">
              {PLANS.PRO.features.map((feature, i) => (
                <li key={i} className="flex items-center gap-2 text-[#0a0a0a]">
                  <svg className="w-5 h-5 text-[#e85d26] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>
            {userId ? (
              currentPlan === 'PRO' ? (
                <span className="block w-full text-center py-3 bg-[#f5f0e8] text-[#0a0a0a] rounded-full">
                  Current Plan
                </span>
              ) : (
                <form action="/api/checkout" method="POST">
                  <input type="hidden" name="plan" value="PRO" />
                  <button
                    type="submit"
                    className="block w-full text-center py-3 bg-[#e85d26] hover:bg-[#d14d1a] text-white rounded-full font-medium transition-colors"
                  >
                    {currentPlan === 'CREATOR' ? 'Downgrade to Creator' : 'Upgrade to Creator'}
                  </button>
                </form>
              )
            ) : (
              <Link
                href="/sign-up"
                className="block w-full text-center py-3 bg-[#e85d26] hover:bg-[#d14d1a] text-white rounded-full font-medium transition-colors"
              >
                Start Free Trial
              </Link>
            )}
          </div>

          {/* Creator Plan */}
          <div className={`bg-white border border-[#e0dbd4] rounded-2xl p-4 sm:p-6 ${currentPlan === 'CREATOR' ? 'border-2 border-[#e85d26]' : ''}`}>
            {currentPlan === 'CREATOR' && (
              <span className="inline-block px-3 py-1 bg-[rgba(232,93,38,0.1)] text-[#e85d26] text-xs font-medium rounded-full mb-4">
                Current Plan
              </span>
            )}
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-xl font-semibold text-[#0a0a0a]">{PLANS.CREATOR.name}</h3>
              <span className="px-2 py-0.5 bg-[rgba(232,93,38,0.1)] text-[#e85d26] text-xs font-bold rounded-full">50% OFF</span>
            </div>
            <div className="mb-4">
              <span className="text-lg text-[#8a8580] line-through mr-2">${PLANS.CREATOR.price}</span>
              <span className="text-4xl font-bold text-[#0a0a0a]">${(PLANS.CREATOR.price / 2).toFixed(2).replace(/\.00$/, '')}</span>
              <span className="text-[#8a8580]">/month</span>
            </div>
            <ul className="space-y-3 mb-6">
              {PLANS.CREATOR.features.map((feature, i) => (
                <li key={i} className="flex items-center gap-2 text-[#0a0a0a]">
                  <svg className="w-5 h-5 text-[#e85d26] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>
            {userId ? (
              currentPlan === 'CREATOR' ? (
                <span className="block w-full text-center py-3 bg-[#f5f0e8] text-[#0a0a0a] rounded-full">
                  Current Plan
                </span>
              ) : (
                <form action="/api/checkout" method="POST">
                  <input type="hidden" name="plan" value="CREATOR" />
                  <button
                    type="submit"
                    className="block w-full text-center py-3 bg-[#f5f0e8] text-[#0a0a0a] hover:bg-[#e0dbd4] rounded-full font-medium transition-colors"
                  >
                    Upgrade to Business
                  </button>
                </form>
              )
            ) : (
              <Link
                href="/sign-up"
                className="block w-full text-center py-3 bg-[#f5f0e8] text-[#0a0a0a] hover:bg-[#e0dbd4] rounded-full font-medium transition-colors"
              >
                Start Free Trial
              </Link>
            )}
          </div>

          {/* Enterprise Plan */}
          <div className={`bg-white border border-[#e0dbd4] rounded-2xl p-4 sm:p-6 ${currentPlan === 'ENTERPRISE' ? 'border-2 border-[#e85d26]' : ''}`}>
            {currentPlan === 'ENTERPRISE' && (
              <span className="inline-block px-3 py-1 bg-[rgba(232,93,38,0.1)] text-[#e85d26] text-xs font-medium rounded-full mb-4">
                Current Plan
              </span>
            )}
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-xl font-semibold text-[#0a0a0a]">{PLANS.ENTERPRISE.name}</h3>
              <span className="px-2 py-0.5 bg-[rgba(232,93,38,0.1)] text-[#e85d26] text-xs font-bold rounded-full">50% OFF</span>
            </div>
            <div className="mb-4">
              <span className="text-4xl font-bold text-[#0a0a0a]">Custom</span>
            </div>
            <ul className="space-y-3 mb-6">
              {PLANS.ENTERPRISE.features.map((feature, i) => (
                <li key={i} className="flex items-center gap-2 text-[#0a0a0a]">
                  <svg className="w-5 h-5 text-[#e85d26] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>
            <a
              href="mailto:support@timebackvideo.com"
              className="block w-full text-center py-3 bg-[#f5f0e8] text-[#0a0a0a] hover:bg-[#e0dbd4] rounded-full font-medium transition-colors"
            >
              Contact Us
            </a>
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-12 sm:mt-20 max-w-3xl mx-auto">
          <h2 className="text-xl sm:text-2xl font-bold text-[#0a0a0a] text-center mb-6 sm:mb-8" style={{ fontFamily: "'Instrument Serif', serif" }}>Frequently Asked Questions</h2>
          <div className="space-y-3 sm:space-y-4">
            <div className="bg-white border border-[#e0dbd4] rounded-2xl p-4 sm:p-6">
              <h3 className="text-base sm:text-lg font-semibold text-[#0a0a0a] mb-2">What happens when I reach my video limit?</h3>
              <p className="text-[#8a8580] text-sm sm:text-base">You can upgrade anytime to process more videos. Your processed videos remain available.</p>
            </div>
            <div className="bg-white border border-[#e0dbd4] rounded-2xl p-4 sm:p-6">
              <h3 className="text-base sm:text-lg font-semibold text-[#0a0a0a] mb-2">Can I cancel anytime?</h3>
              <p className="text-[#8a8580] text-sm sm:text-base">Yes, you can cancel your subscription anytime. Your plan stays active until the end of your billing period.</p>
            </div>
            <div className="bg-white border border-[#e0dbd4] rounded-2xl p-4 sm:p-6">
              <h3 className="text-base sm:text-lg font-semibold text-[#0a0a0a] mb-2">What video formats are supported?</h3>
              <p className="text-[#8a8580] text-sm sm:text-base">We support MP4, MOV, AVI, MKV, and most common video formats.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="lp-footer">
        <div className="footer-logo">TimeBack</div>
        <div className="footer-links">
          <Link href="/pricing">Pricing</Link>
          <a href="https://www.youtube.com/playlist?list=PLhATaQNX0bxMeX0e8AA-TSk8L0g3t-QX7" target="_blank" rel="noopener noreferrer">Tutorials</a>
          <a href="mailto:support@timebackvideo.com">Support</a>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </div>
        <div className="copyright">&copy; 2026 TimeBack. All rights reserved.</div>
      </footer>
    </div>
  )
}
