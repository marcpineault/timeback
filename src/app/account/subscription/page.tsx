import { redirect } from 'next/navigation'
import Link from 'next/link'
import { UserButton } from '@clerk/nextjs'
import { getOrCreateUser } from '@/lib/user'
import { PLANS, PlanType } from '@/lib/plans'
import { stripe } from '@/lib/stripe'
import SubscriptionActions from './SubscriptionActions'
import type Stripe from 'stripe'

async function getSubscriptionDetails(stripeSubscriptionId: string | null) {
  if (!stripeSubscriptionId || !stripe) {
    return null
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId) as Stripe.Subscription
    return {
      status: subscription.status,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      cancelAt: subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null,
    }
  } catch (error) {
    console.error('Error fetching subscription:', error)
    return null
  }
}

export default async function SubscriptionPage() {
  const user = await getOrCreateUser()

  if (!user) {
    redirect('/sign-in')
  }

  const planDetails = PLANS[user.plan as PlanType]
  const subscription = await getSubscriptionDetails(user.stripeSubscriptionId)
  const hasActiveSubscription = user.plan !== 'FREE' && subscription?.status === 'active'

  return (
    <div className="min-h-screen bg-[#0F0F14]">
      {/* Header */}
      <header className="border-b border-gray-800">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo.svg" alt="TimeBack" className="w-8 h-8" />
            <span className="text-xl font-bold text-white">TimeBack</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-gray-400 hover:text-white transition-colors text-sm"
            >
              Dashboard
            </Link>
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Page Title */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">Subscription</h1>
          <p className="text-gray-400">Manage your subscription and billing</p>
        </div>

        {/* Current Plan Card */}
        <div className="bg-[#1A1A24] rounded-xl p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-xl font-semibold text-white">{planDetails.name} Plan</h2>
                {hasActiveSubscription && (
                  <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs font-medium rounded-full">
                    Active
                  </span>
                )}
                {subscription?.cancelAtPeriodEnd && (
                  <span className="px-2 py-1 bg-amber-500/20 text-amber-400 text-xs font-medium rounded-full">
                    Cancels Soon
                  </span>
                )}
              </div>
              <p className="text-gray-400">
                {planDetails.price !== null
                  ? `$${planDetails.price}/month`
                  : 'Custom pricing'}
              </p>
            </div>
            {user.plan !== 'ENTERPRISE' && (
              <Link
                href="/pricing"
                className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {user.plan === 'FREE' ? 'Upgrade' : 'Change Plan'}
              </Link>
            )}
          </div>

          {/* Plan Features */}
          <div className="border-t border-gray-700 pt-4 mt-4">
            <h3 className="text-sm font-medium text-gray-300 mb-3">Plan Features</h3>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {planDetails.features.map((feature, index) => (
                <li key={index} className="flex items-center gap-2 text-gray-400 text-sm">
                  <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Billing Details Card */}
        {hasActiveSubscription && subscription && (
          <div className="bg-[#1A1A24] rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-white mb-4">Billing Details</h2>

            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-gray-700">
                <span className="text-gray-400">Billing Period</span>
                <span className="text-white">
                  {subscription.currentPeriodStart.toLocaleDateString()} - {subscription.currentPeriodEnd.toLocaleDateString()}
                </span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-gray-700">
                <span className="text-gray-400">Next Payment</span>
                <span className="text-white">
                  {subscription.cancelAtPeriodEnd
                    ? 'No upcoming payment (subscription ending)'
                    : subscription.currentPeriodEnd.toLocaleDateString()}
                </span>
              </div>

              {subscription.cancelAtPeriodEnd && subscription.cancelAt && (
                <div className="flex justify-between items-center py-2 border-b border-gray-700">
                  <span className="text-gray-400">Access Until</span>
                  <span className="text-amber-400">
                    {subscription.cancelAt.toLocaleDateString()}
                  </span>
                </div>
              )}

              <div className="flex justify-between items-center py-2">
                <span className="text-gray-400">Status</span>
                <span className={`capitalize ${
                  subscription.status === 'active' ? 'text-green-400' :
                  subscription.status === 'past_due' ? 'text-amber-400' :
                  'text-gray-400'
                }`}>
                  {subscription.cancelAtPeriodEnd ? 'Canceling' : subscription.status}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Subscription Actions */}
        <div className="bg-[#1A1A24] rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Manage Subscription</h2>

          <SubscriptionActions
            plan={user.plan}
            hasStripeCustomer={!!user.stripeCustomerId}
            isSubscriptionActive={hasActiveSubscription}
            isCanceling={subscription?.cancelAtPeriodEnd ?? false}
          />
        </div>

        {/* Help Section */}
        <div className="mt-8 text-center">
          <p className="text-gray-500 text-sm">
            Need help with your subscription?{' '}
            <a href="mailto:support@timeback.ai" className="text-indigo-400 hover:text-indigo-300">
              Contact support
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
