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
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="pt-4 px-4">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between bg-white rounded-2xl">
          <Link href="/" className="text-xl font-bold text-gray-900">TimeBack</Link>
          <div className="flex items-center gap-4">
            {userId ? (
              <Link
                href="/dashboard"
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link href="/sign-in" className="text-gray-600 hover:text-gray-900 transition-colors">
                  Sign In
                </Link>
                <Link
                  href="/sign-up"
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">Simple, Transparent Pricing</h1>
          <p className="text-gray-400 text-lg">Start free. Upgrade when you need more.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {/* Free Plan */}
          <div className={`bg-gray-800 rounded-xl p-6 border-2 ${currentPlan === 'FREE' ? 'border-blue-500' : 'border-transparent'}`}>
            {currentPlan === 'FREE' && (
              <span className="inline-block px-3 py-1 bg-blue-500/20 text-blue-400 text-xs font-medium rounded-full mb-4">
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
          <div className={`bg-gray-800 rounded-xl p-6 border-2 ${currentPlan === 'PRO' ? 'border-blue-500' : 'border-blue-500/50'} relative`}>
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-blue-500 text-white text-xs font-medium rounded-full">
              Most Popular
            </span>
            {currentPlan === 'PRO' && (
              <span className="inline-block px-3 py-1 bg-blue-500/20 text-blue-400 text-xs font-medium rounded-full mb-4">
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
                    className="block w-full text-center py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
                  >
                    {currentPlan === 'BUSINESS' ? 'Downgrade to Pro' : 'Upgrade to Pro'}
                  </button>
                </form>
              )
            ) : (
              <Link
                href="/sign-up"
                className="block w-full text-center py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
              >
                Start Free Trial
              </Link>
            )}
          </div>

          {/* Business Plan */}
          <div className={`bg-gray-800 rounded-xl p-6 border-2 ${currentPlan === 'BUSINESS' ? 'border-blue-500' : 'border-transparent'}`}>
            {currentPlan === 'BUSINESS' && (
              <span className="inline-block px-3 py-1 bg-blue-500/20 text-blue-400 text-xs font-medium rounded-full mb-4">
                Current Plan
              </span>
            )}
            <h3 className="text-xl font-semibold text-white mb-2">{PLANS.BUSINESS.name}</h3>
            <div className="mb-4">
              <span className="text-4xl font-bold text-white">${PLANS.BUSINESS.price}</span>
              <span className="text-gray-400">/month</span>
            </div>
            <ul className="space-y-3 mb-6">
              {PLANS.BUSINESS.features.map((feature, i) => (
                <li key={i} className="flex items-center gap-2 text-gray-400">
                  <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>
            {userId ? (
              currentPlan === 'BUSINESS' ? (
                <span className="block w-full text-center py-3 bg-gray-700 text-gray-400 rounded-lg">
                  Current Plan
                </span>
              ) : (
                <form action="/api/checkout" method="POST">
                  <input type="hidden" name="plan" value="BUSINESS" />
                  <button
                    type="submit"
                    className="block w-full text-center py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
                  >
                    Upgrade to Business
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
        </div>

        {/* FAQ */}
        <div className="mt-20 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-white text-center mb-8">Frequently Asked Questions</h2>
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-2">What happens when I reach my video limit?</h3>
              <p className="text-gray-400">You can upgrade anytime to process more videos. Your processed videos remain available.</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-2">Can I cancel anytime?</h3>
              <p className="text-gray-400">Yes, you can cancel your subscription anytime. Your plan stays active until the end of your billing period.</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-2">What video formats are supported?</h3>
              <p className="text-gray-400">We support MP4, MOV, AVI, MKV, and most common video formats.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
