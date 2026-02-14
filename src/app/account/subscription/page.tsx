import { redirect } from 'next/navigation'
import Link from 'next/link'
import { UserButton } from '@clerk/nextjs'
import { getOrCreateUser } from '@/lib/user'
import { PLANS, PlanType } from '@/lib/plans'
import { stripe } from '@/lib/stripe'
import SubscriptionActions from './SubscriptionActions'

async function getSubscriptionDetails(stripeSubscriptionId: string | null) {
  if (!stripeSubscriptionId || !stripe) {
    return null
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
      expand: ['items.data'],
    })

    // In Stripe API 2025-03-31+, billing periods are now at subscription item level
    const firstItem = subscription.items.data[0]
    const currentPeriodEnd = firstItem?.current_period_end
    const currentPeriodStart = firstItem?.current_period_start

    return {
      status: subscription.status,
      currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : new Date(),
      currentPeriodStart: currentPeriodStart ? new Date(currentPeriodStart * 1000) : new Date(),
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
    <div className="landing-page min-h-screen">
      {/* Header */}
      <nav className="lp-nav">
        <Link href="/" className="nav-logo">TimeBack</Link>
        <div className="nav-links">
          <Link href="/dashboard">Dashboard</Link>
          <UserButton afterSignOutUrl="/" />
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-8" style={{ paddingTop: '5rem' }}>
        {/* Page Title */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#0a0a0a] mb-2" style={{ fontFamily: "'Instrument Serif', serif" }}>Subscription</h1>
          <p className="text-[#8a8580]">Manage your subscription and billing</p>
        </div>

        {/* Current Plan Card */}
        <div className="bg-white border border-[#e0dbd4] rounded-2xl p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-xl font-semibold text-[#0a0a0a]" style={{ fontFamily: "'Instrument Serif', serif" }}>{planDetails.name} Plan</h2>
                {hasActiveSubscription && (
                  <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs font-medium rounded-full">
                    Active
                  </span>
                )}
                {subscription?.cancelAtPeriodEnd && (
                  <span className="px-2 py-1 bg-amber-500/10 text-amber-400 text-xs font-medium rounded-full">
                    Cancels Soon
                  </span>
                )}
              </div>
              <p className="text-[#8a8580]">
                {planDetails.price !== null
                  ? `$${planDetails.price}/month`
                  : 'Custom pricing'}
              </p>
            </div>
            {user.plan !== 'ENTERPRISE' && (
              <Link
                href="/pricing"
                className="px-4 py-2 bg-[#e85d26] hover:bg-[#d14d1a] text-[#0a0a0a] rounded-full text-sm font-medium transition-colors"
              >
                {user.plan === 'FREE' ? 'Upgrade' : 'Change Plan'}
              </Link>
            )}
          </div>

          {/* Plan Features */}
          <div className="border-t border-[#e0dbd4] pt-4 mt-4">
            <h3 className="text-sm font-medium text-[#0a0a0a] mb-3">Plan Features</h3>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {planDetails.features.map((feature, index) => (
                <li key={index} className="flex items-center gap-2 text-[#8a8580] text-sm">
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
          <div className="bg-white border border-[#e0dbd4] rounded-2xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-[#0a0a0a] mb-4" style={{ fontFamily: "'Instrument Serif', serif" }}>Billing Details</h2>

            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-[#e0dbd4]">
                <span className="text-[#8a8580]">Billing Period</span>
                <span className="text-[#0a0a0a]">
                  {subscription.currentPeriodStart.toLocaleDateString()} - {subscription.currentPeriodEnd.toLocaleDateString()}
                </span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-[#e0dbd4]">
                <span className="text-[#8a8580]">Next Payment</span>
                <span className="text-[#0a0a0a]">
                  {subscription.cancelAtPeriodEnd
                    ? 'No upcoming payment (subscription ending)'
                    : subscription.currentPeriodEnd.toLocaleDateString()}
                </span>
              </div>

              {subscription.cancelAtPeriodEnd && subscription.cancelAt && (
                <div className="flex justify-between items-center py-2 border-b border-[#e0dbd4]">
                  <span className="text-[#8a8580]">Access Until</span>
                  <span className="text-amber-400">
                    {subscription.cancelAt.toLocaleDateString()}
                  </span>
                </div>
              )}

              <div className="flex justify-between items-center py-2">
                <span className="text-[#8a8580]">Status</span>
                <span className={`capitalize ${
                  subscription.status === 'active' ? 'text-green-400' :
                  subscription.status === 'past_due' ? 'text-amber-400' :
                  'text-[#8a8580]'
                }`}>
                  {subscription.cancelAtPeriodEnd ? 'Canceling' : subscription.status}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Subscription Actions */}
        <div className="bg-white border border-[#e0dbd4] rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-[#0a0a0a] mb-4" style={{ fontFamily: "'Instrument Serif', serif" }}>Manage Subscription</h2>

          <SubscriptionActions
            plan={user.plan}
            hasStripeCustomer={!!user.stripeCustomerId}
            isSubscriptionActive={hasActiveSubscription}
            isCanceling={subscription?.cancelAtPeriodEnd ?? false}
          />
        </div>

        {/* Help Section */}
        <div className="mt-8 text-center">
          <p className="text-[#8a8580] text-sm">
            Need help with your subscription?{' '}
            <a href="mailto:support@timeback.ai" className="text-[#e85d26] hover:text-[#d14d1a]">
              Contact support
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
