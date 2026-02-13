import { redirect } from 'next/navigation'
import { getOrCreateUser, getUserUsage } from '@/lib/user'
import { getEnabledFeatures } from '@/lib/featureFlags'
import Link from 'next/link'
import { UserButton } from '@clerk/nextjs'
import IdeateDashboard from './IdeateDashboard'

export default async function IdeatePage() {
  const user = await getOrCreateUser()

  if (!user) {
    redirect('/sign-in')
  }

  const features = getEnabledFeatures(user.email)

  if (!features.ideate) {
    redirect('/dashboard')
  }

  const usage = await getUserUsage(user.id)

  return (
    <div className="min-h-screen bg-[#0F0F14]">
      {/* Header */}
      <header className="border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo.svg" alt="TimeBack" className="w-8 h-8" />
            <span className="text-xl font-bold text-white">TimeBack</span>
          </Link>
          <div className="flex items-center gap-3 sm:gap-4">
            <Link
              href="/dashboard"
              className="text-gray-400 hover:text-white transition-colors text-sm"
            >
              Editor
            </Link>
            {features.instagramScheduling && (
              <Link
                href="/dashboard/schedule"
                className="text-gray-400 hover:text-white transition-colors text-sm"
              >
                Schedule
              </Link>
            )}
            <Link
              href="/dashboard/ideate"
              className="text-white font-medium text-sm"
            >
              Ideate
            </Link>
            <Link
              href="/account/subscription"
              className="text-gray-400 hover:text-white transition-colors text-sm"
            >
              Subscription
            </Link>
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <IdeateDashboard
          ideateUsed={usage?.ideateUsed ?? 0}
          ideateLimit={usage?.planDetails.ideateGenerationsPerMonth ?? null}
          plan={usage?.plan ?? 'FREE'}
        />
      </div>
    </div>
  )
}
