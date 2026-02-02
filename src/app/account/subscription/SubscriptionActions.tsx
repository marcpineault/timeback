'use client'

import { useState } from 'react'
import Link from 'next/link'

interface SubscriptionActionsProps {
  plan: string
  hasStripeCustomer: boolean
  isSubscriptionActive: boolean
  isCanceling: boolean
}

export default function SubscriptionActions({
  plan,
  hasStripeCustomer,
  isSubscriptionActive,
  isCanceling,
}: SubscriptionActionsProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleManageBilling = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/billing/portal', {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to open billing portal')
      }

      // Redirect to Stripe billing portal
      window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setIsLoading(false)
    }
  }

  // Free plan user - show upgrade option
  if (plan === 'FREE') {
    return (
      <div className="space-y-4">
        <p className="text-gray-400 text-sm">
          You&apos;re currently on the free plan. Upgrade to unlock more features and higher limits.
        </p>
        <Link
          href="/pricing"
          className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white rounded-lg text-sm font-medium transition-colors"
        >
          View Plans
        </Link>
      </div>
    )
  }

  // Enterprise user - contact support
  if (plan === 'ENTERPRISE') {
    return (
      <div className="space-y-4">
        <p className="text-gray-400 text-sm">
          You&apos;re on the Enterprise plan. Contact your account manager for any subscription changes.
        </p>
        <a
          href="mailto:enterprise@timeback.ai"
          className="inline-flex items-center px-4 py-2 bg-[#2A2A3A] hover:bg-[#3A3A4A] text-white rounded-lg text-sm font-medium transition-colors"
        >
          Contact Account Manager
        </a>
      </div>
    )
  }

  // Paid user with active subscription
  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {isCanceling ? (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <p className="text-amber-400 text-sm mb-3">
            Your subscription is set to cancel at the end of the current billing period.
            You can reactivate it anytime before then.
          </p>
          <button
            onClick={handleManageBilling}
            disabled={isLoading}
            className="inline-flex items-center px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Loading...' : 'Reactivate Subscription'}
          </button>
        </div>
      ) : (
        <p className="text-gray-400 text-sm">
          Manage your payment method, view invoices, or cancel your subscription through the billing portal.
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        {hasStripeCustomer && (
          <button
            onClick={handleManageBilling}
            disabled={isLoading}
            className="inline-flex items-center px-4 py-2 bg-[#2A2A3A] hover:bg-[#3A3A4A] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Opening...
              </>
            ) : (
              <>
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                Manage Billing
              </>
            )}
          </button>
        )}

        <Link
          href="/pricing"
          className="inline-flex items-center px-4 py-2 bg-[#2A2A3A] hover:bg-[#3A3A4A] text-white rounded-lg text-sm font-medium transition-colors"
        >
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
          Change Plan
        </Link>
      </div>

      {!isCanceling && isSubscriptionActive && (
        <div className="pt-4 border-t border-gray-700">
          <button
            onClick={handleManageBilling}
            disabled={isLoading}
            className="text-red-400 hover:text-red-300 text-sm transition-colors disabled:opacity-50"
          >
            Cancel Subscription
          </button>
          <p className="text-gray-500 text-xs mt-1">
            You can cancel anytime. Your access continues until the end of your billing period.
          </p>
        </div>
      )}
    </div>
  )
}
