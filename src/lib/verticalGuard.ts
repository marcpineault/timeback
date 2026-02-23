import { redirect } from 'next/navigation'
import { getOrCreateUser } from './user'

/**
 * Checks if the current user has completed vertical onboarding.
 * If not, redirects to /dashboard/onboarding.
 * Call this at the top of any protected server page that requires vertical selection.
 * Returns the user if they've completed onboarding.
 */
export async function requireVerticalOnboarding() {
  const user = await getOrCreateUser()

  if (!user) {
    redirect('/sign-in')
  }

  if (!user.vertical) {
    redirect('/dashboard/onboarding')
  }

  return user
}
