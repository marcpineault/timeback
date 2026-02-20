import { redirect } from 'next/navigation'
import Link from 'next/link'
import { UserButton } from '@clerk/nextjs'
import { getOrCreateUser, getUserUsage } from '@/lib/user'
import { PLANS, PlanType } from '@/lib/plans'
import { stripe } from '@/lib/stripe'
import { getEnabledFeatures } from '@/lib/featureFlags'
import SubscriptionActions from './SubscriptionActions'
import MobileMenuToggle from '@/components/MobileMenuToggle'

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

async function getRecentInvoices(stripeCustomerId: string | null) {
  if (!stripeCustomerId || !stripe) {
    return []
  }

  try {
    const invoices = await stripe.invoices.list({
      customer: stripeCustomerId,
      limit: 5,
    })

    return invoices.data.map(inv => ({
      id: inv.id,
      date: new Date((inv.created ?? 0) * 1000),
      amount: (inv.amount_paid ?? 0) / 100,
      status: inv.status ?? 'unknown',
      pdfUrl: inv.invoice_pdf ?? null,
    }))
  } catch (error) {
    console.error('Error fetching invoices:', error)
    return []
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
  const usage = await getUserUsage(user.id)
  const invoices = await getRecentInvoices(user.stripeCustomerId)
  const features = getEnabledFeatures(user.email)

  // Calculate renewal days
  const renewalDays = subscription?.currentPeriodEnd
    ? Math.max(0, Math.ceil((subscription.currentPeriodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null

  // Calculate next reset date
  const now = new Date()
  const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const resetDateStr = nextReset.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  // Usage calculations
  const videosUsed = usage?.videosUsed ?? 0
  const videosLimit = usage?.planDetails.videosPerMonth ?? null
  const videosPercent = videosLimit ? Math.min((videosUsed / videosLimit) * 100, 100) : 0
  const ideateUsed = usage?.ideateUsed ?? 0
  const ideateLimit = usage?.planDetails.ideateGenerationsPerMonth ?? null
  const ideateRemaining = ideateLimit ? Math.max(0, ideateLimit - ideateUsed) : null

  // Determine upgrade plan
  const PLAN_ORDER = ['FREE', 'PRO', 'CREATOR', 'ENTERPRISE']
  const currentPlanIndex = PLAN_ORDER.indexOf(user.plan)
  const nextPlanKey = currentPlanIndex < PLAN_ORDER.length - 1 ? PLAN_ORDER[currentPlanIndex + 1] : null
  const nextPlan = nextPlanKey ? PLANS[nextPlanKey as PlanType] : null

  return (
    <div className="landing-page min-h-screen">
      {/* Header */}
      <nav className="lp-nav">
        <Link href="/" className="nav-logo">TimeBack</Link>
        <MobileMenuToggle />
        <div className="nav-links">
          <Link href="/dashboard">Editor</Link>
          {features.instagramScheduling && (
            <Link href="/dashboard/schedule">Schedule</Link>
          )}
          {features.ideate && (
            <Link href="/dashboard/ideate">Ideate</Link>
          )}
          <Link href="/account/subscription" style={{ color: '#0a0a0a', fontWeight: 600 }}>Subscription</Link>
          <UserButton afterSignOutUrl="/" />
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-8" style={{ paddingTop: '5rem' }}>
        {/* Page Title */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#0a0a0a] mb-2" style={{ fontFamily: "'Instrument Serif', serif" }}>Subscription</h1>
          <p className="text-[#8a8580]">Manage your subscription and billing</p>
        </div>

        {/* Usage Summary */}
        <div className="bg-white border border-[#e0dbd4] rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-[#0a0a0a] mb-4" style={{ fontFamily: "'Instrument Serif', serif" }}>Usage This Month</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Videos */}
            <div className="flex items-center gap-4">
              <svg width="56" height="56" viewBox="0 0 56 56" className="flex-shrink-0">
                <circle cx="28" cy="28" r="24" fill="none" strokeWidth="4" className="progress-ring-bg" />
                <circle
                  cx="28" cy="28" r="24" fill="none" strokeWidth="4"
                  className="progress-ring-fill"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 24}`}
                  strokeDashoffset={`${2 * Math.PI * 24 * (1 - videosPercent / 100)}`}
                />
                <text x="28" y="24" textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="700" fill="#0a0a0a">
                  {videosUsed}
                </text>
                <text x="28" y="36" textAnchor="middle" fontSize="7" fill="#8a8580">
                  /{videosLimit ?? '\u221E'}
                </text>
              </svg>
              <div>
                <p className="text-sm font-medium text-[#0a0a0a]">Videos processed</p>
                <p className="text-xs text-[#8a8580]">
                  {videosLimit ? `${videosLimit - videosUsed} remaining` : 'Unlimited'}
                </p>
              </div>
            </div>
            {/* AI Generations */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[rgba(232,93,38,0.08)] rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-[#e85d26]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-[#0a0a0a]">
                  {ideateRemaining !== null ? `${ideateRemaining} AI generations` : 'Unlimited'}
                </p>
                <p className="text-xs text-[#8a8580]">remaining this month</p>
              </div>
            </div>
            {/* Reset Date */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[rgba(59,130,246,0.08)] rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-[#0a0a0a]">Next reset</p>
                <p className="text-xs text-[#8a8580]">{resetDateStr}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Current Plan Card */}
        <div className="bg-white border border-[#e0dbd4] rounded-2xl p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-xl font-semibold text-[#0a0a0a]" style={{ fontFamily: "'Instrument Serif', serif" }}>{planDetails.name} Plan</h2>
                {hasActiveSubscription && (
                  <span className="px-3 py-1 bg-green-500/15 text-green-600 text-xs font-semibold rounded-full border border-green-500/20">
                    Active
                  </span>
                )}
                {subscription?.cancelAtPeriodEnd && (
                  <span className="px-2 py-1 bg-amber-500/10 text-amber-500 text-xs font-medium rounded-full">
                    Cancels Soon
                  </span>
                )}
              </div>
              <p className="text-[#8a8580] text-lg">
                {planDetails.price !== null
                  ? `$${planDetails.price}/month`
                  : 'Custom pricing'}
              </p>
              {renewalDays !== null && !subscription?.cancelAtPeriodEnd && (
                <p className="text-[#8a8580] text-sm mt-1">
                  Your plan renews in {renewalDays} day{renewalDays !== 1 ? 's' : ''}
                </p>
              )}
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
                  <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Upgrade Nudge */}
        {nextPlan && user.plan !== 'ENTERPRISE' && (
          <div className="bg-[#faf7f2] border border-[#e0dbd4] rounded-2xl p-5 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#0a0a0a]">
                  Need more? Upgrade to {nextPlan.name}
                </p>
                <p className="text-xs text-[#8a8580] mt-0.5">
                  {nextPlanKey === 'PRO' && 'Get 120 videos/month, 1080p, and no watermark'}
                  {nextPlanKey === 'CREATOR' && 'Get 250 videos/month, 200 AI generations, and 10 min videos'}
                  {nextPlanKey === 'ENTERPRISE' && 'Unlimited everything, 4K resolution, and API access'}
                </p>
              </div>
              <Link
                href="/pricing"
                className="px-4 py-2 bg-[#e85d26] hover:bg-[#d14d1a] text-[#0a0a0a] rounded-full text-sm font-medium transition-colors flex-shrink-0"
              >
                {nextPlan.price !== null ? `Upgrade — $${nextPlan.price}/mo` : 'Contact Sales'}
              </Link>
            </div>
          </div>
        )}

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
                  <span className="text-amber-500">
                    {subscription.cancelAt.toLocaleDateString()}
                  </span>
                </div>
              )}

              <div className="flex justify-between items-center py-2">
                <span className="text-[#8a8580]">Status</span>
                <span className={`capitalize ${
                  subscription.status === 'active' ? 'text-green-500' :
                  subscription.status === 'past_due' ? 'text-amber-500' :
                  'text-[#8a8580]'
                }`}>
                  {subscription.cancelAtPeriodEnd ? 'Canceling' : subscription.status}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Invoice History */}
        {invoices.length > 0 && (
          <div className="bg-white border border-[#e0dbd4] rounded-2xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-[#0a0a0a] mb-4" style={{ fontFamily: "'Instrument Serif', serif" }}>Invoice History</h2>
            <div className="overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="text-left">
                    <th className="text-[#8a8580] text-sm font-medium pb-3">Date</th>
                    <th className="text-[#8a8580] text-sm font-medium pb-3">Amount</th>
                    <th className="text-[#8a8580] text-sm font-medium pb-3">Status</th>
                    <th className="text-[#8a8580] text-sm font-medium pb-3 text-right">Invoice</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e0dbd4]">
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="py-3 text-[#0a0a0a] text-sm">{inv.date.toLocaleDateString()}</td>
                      <td className="py-3 text-[#0a0a0a] text-sm">${inv.amount.toFixed(2)}</td>
                      <td className="py-3">
                        <span className={`status-badge ${
                          inv.status === 'paid' ? 'status-completed' :
                          inv.status === 'open' ? 'status-processing' :
                          'status-queued'
                        }`}>
                          {inv.status === 'paid' ? 'Paid' : inv.status === 'open' ? 'Open' : inv.status}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        {inv.pdfUrl && (
                          <a
                            href={inv.pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#e85d26] hover:text-[#d14d1a] text-sm"
                          >
                            Download
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Manage Subscription - Actions that aren't cancel */}
        <div className="bg-white border border-[#e0dbd4] rounded-2xl p-6 mb-6">
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
