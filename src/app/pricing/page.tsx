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
    <div className="min-h-screen bg-[#0F0F14]">
      {/* Header */}
      <header className="border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo.svg" alt="TimeBack" className="w-8 h-8" />
            <span className="text-xl font-bold text-white">TimeBack</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            <a
              href="https://www.youtube.com/playlist?list=PLhATaQNX0bxMeX0e8AA-TSk8L0g3t-QX7"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-white transition-colors text-sm sm:text-base"
            >
              Tutorials
            </a>
            {userId ? (
              <Link
                href="/dashboard"
                className="px-3 sm:px-4 py-2 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white rounded-lg font-medium transition-colors text-sm sm:text-base"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link href="/sign-in" className="hidden sm:block text-gray-400 hover:text-white transition-colors">
                  Sign In
                </Link>
                <Link
                  href="/sign-up"
                  className="px-3 sm:px-4 py-2 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white rounded-lg font-medium transition-colors text-sm sm:text-base"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8 sm:py-16">
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-2xl sm:text-4xl font-bold text-white mb-3 sm:mb-4">Simple, Transparent Pricing</h1>
          <p className="text-gray-400 text-base sm:text-lg">Start free. Upgrade when you need more.</p>
          <p className="text-green-400 text-sm sm:text-base mt-2 flex items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            30-day money-back guarantee on all paid plans
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 max-w-6xl mx-auto">
          {/* Free Plan */}
          <div className={`bg-[#1A1A24] rounded-xl p-4 sm:p-6 border-2 ${currentPlan === 'FREE' ? 'border-violet-500' : 'border-transparent'}`}>
            {currentPlan === 'FREE' && (
              <span className="inline-block px-3 py-1 bg-violet-500/20 text-violet-400 text-xs font-medium rounded-full mb-4">
                Current Plan
              </span>
            )}
            <h3 className="text-xl font-semibold text-white mb-2">{PLANS.FREE.name}</h3>
            <div className="mb-4">
              <span className="text-4xl font-bold text-white">$0</span>
              <span className="text-gray-400">/month</span>
            </div>
            <ul className="space-y-3 mb-6">
              {PLANS.FREE.features.map((feature, i) => (
                <li key={i} className="flex items-center gap-2 text-gray-400">
                  <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>
            {userId ? (
              currentPlan === 'FREE' ? (
                <span className="block w-full text-center py-3 bg-gray-700 text-gray-400 rounded-lg">
                  Current Plan
                </span>
              ) : (
                <span className="block w-full text-center py-3 bg-gray-700 text-gray-400 rounded-lg">
                  Downgrade
                </span>
              )
            ) : (
              <Link
                href="/sign-up"
                className="block w-full text-center py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
              >
                Get Started
              </Link>
            )}
          </div>

          {/* Pro Plan */}
          <div className={`bg-[#1A1A24] rounded-xl p-4 sm:p-6 border-2 ${currentPlan === 'PRO' ? 'border-violet-500' : 'border-violet-500/50'} relative`}>
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-xs font-medium rounded-full">
              Most Popular
            </span>
            {currentPlan === 'PRO' && (
              <span className="inline-block px-3 py-1 bg-violet-500/20 text-violet-400 text-xs font-medium rounded-full mb-4">
                Current Plan
              </span>
            )}
            <h3 className="text-xl font-semibold text-white mb-2">{PLANS.PRO.name}</h3>
            <div className="mb-4">
              <span className="text-4xl font-bold text-white">${PLANS.PRO.price}</span>
              <span className="text-gray-400">/month</span>
            </div>
            <ul className="space-y-3 mb-6">
              {PLANS.PRO.features.map((feature, i) => (
                <li key={i} className="flex items-center gap-2 text-gray-400">
                  <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>
            {userId ? (
              currentPlan === 'PRO' ? (
                <span className="block w-full text-center py-3 bg-gray-700 text-gray-400 rounded-lg">
                  Current Plan
                </span>
              ) : (
                <form action="/api/checkout" method="POST">
                  <input type="hidden" name="plan" value="PRO" />
                  <button
                    type="submit"
                    className="block w-full text-center py-3 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white rounded-lg font-medium transition-colors"
                  >
                    {currentPlan === 'CREATOR' ? 'Downgrade to Pro' : 'Upgrade to Pro'}
                  </button>
                </form>
              )
            ) : (
              <Link
                href="/sign-up"
                className="block w-full text-center py-3 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white rounded-lg font-medium transition-colors"
              >
                Start Free Trial
              </Link>
            )}
          </div>

          {/* Creator Plan */}
          <div className={`bg-[#1A1A24] rounded-xl p-4 sm:p-6 border-2 ${currentPlan === 'CREATOR' ? 'border-violet-500' : 'border-transparent'}`}>
            {currentPlan === 'CREATOR' && (
              <span className="inline-block px-3 py-1 bg-violet-500/20 text-violet-400 text-xs font-medium rounded-full mb-4">
                Current Plan
              </span>
            )}
            <h3 className="text-xl font-semibold text-white mb-2">{PLANS.CREATOR.name}</h3>
            <div className="mb-4">
              <span className="text-4xl font-bold text-white">${PLANS.CREATOR.price}</span>
              <span className="text-gray-400">/month</span>
            </div>
            <ul className="space-y-3 mb-6">
              {PLANS.CREATOR.features.map((feature, i) => (
                <li key={i} className="flex items-center gap-2 text-gray-400">
                  <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>
            {userId ? (
              currentPlan === 'CREATOR' ? (
                <span className="block w-full text-center py-3 bg-gray-700 text-gray-400 rounded-lg">
                  Current Plan
                </span>
              ) : (
                <form action="/api/checkout" method="POST">
                  <input type="hidden" name="plan" value="CREATOR" />
                  <button
                    type="submit"
                    className="block w-full text-center py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
                  >
                    Upgrade to Creator
                  </button>
                </form>
              )
            ) : (
              <Link
                href="/sign-up"
                className="block w-full text-center py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
              >
                Start Free Trial
              </Link>
            )}
          </div>

          {/* Enterprise Plan */}
          <div className={`bg-[#1A1A24] rounded-xl p-4 sm:p-6 border-2 ${currentPlan === 'ENTERPRISE' ? 'border-violet-500' : 'border-transparent'}`}>
            {currentPlan === 'ENTERPRISE' && (
              <span className="inline-block px-3 py-1 bg-violet-500/20 text-violet-400 text-xs font-medium rounded-full mb-4">
                Current Plan
              </span>
            )}
            <h3 className="text-xl font-semibold text-white mb-2">{PLANS.ENTERPRISE.name}</h3>
            <div className="mb-4">
              <span className="text-4xl font-bold text-white">Custom</span>
            </div>
            <ul className="space-y-3 mb-6">
              {PLANS.ENTERPRISE.features.map((feature, i) => (
                <li key={i} className="flex items-center gap-2 text-gray-400">
                  <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>
            <a
              href="mailto:support@timebackvideo.com"
              className="block w-full text-center py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
            >
              Contact Us
            </a>
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-12 sm:mt-20 max-w-3xl mx-auto">
          <h2 className="text-xl sm:text-2xl font-bold text-white text-center mb-6 sm:mb-8">Frequently Asked Questions</h2>
          <div className="space-y-3 sm:space-y-4">
            <div className="bg-[#1A1A24] rounded-lg p-4 sm:p-6">
              <h3 className="text-base sm:text-lg font-semibold text-white mb-2">What happens when I reach my video limit?</h3>
              <p className="text-gray-400 text-sm sm:text-base">You can upgrade anytime to process more videos. Your processed videos remain available.</p>
            </div>
            <div className="bg-[#1A1A24] rounded-lg p-4 sm:p-6">
              <h3 className="text-base sm:text-lg font-semibold text-white mb-2">Can I cancel anytime?</h3>
              <p className="text-gray-400 text-sm sm:text-base">Yes, you can cancel your subscription anytime. Your plan stays active until the end of your billing period.</p>
            </div>
            <div className="bg-[#1A1A24] rounded-lg p-4 sm:p-6">
              <h3 className="text-base sm:text-lg font-semibold text-white mb-2">What video formats are supported?</h3>
              <p className="text-gray-400 text-sm sm:text-base">We support MP4, MOV, AVI, MKV, and most common video formats.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
