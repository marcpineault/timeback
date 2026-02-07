'use server'

import { currentUser } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'

export async function completeOnboarding() {
  const clerkUser = await currentUser()
  if (!clerkUser) return

  await prisma.user.updateMany({
    where: { clerkId: clerkUser.id },
    data: { hasCompletedOnboarding: true },
  })
}
