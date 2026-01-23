import { currentUser } from '@clerk/nextjs/server'
import { prisma } from './db'
import { PLANS, PlanType } from './plans'
import { Video } from '@prisma/client'

export async function getOrCreateUser() {
  const clerkUser = await currentUser()

  if (!clerkUser) {
    return null
  }

  let user = await prisma.user.findUnique({
    where: { clerkId: clerkUser.id },
  })

  if (!user) {
    const email = clerkUser.emailAddresses[0]?.emailAddress || ''

    // Check if user exists by email (in case created with different clerkId from dev/prod switch)
    const existingByEmail = email ? await prisma.user.findUnique({
      where: { email },
    }) : null

    if (existingByEmail) {
      // Update the existing user with the new clerkId
      user = await prisma.user.update({
        where: { id: existingByEmail.id },
        data: { clerkId: clerkUser.id },
      })
    } else {
      user = await prisma.user.create({
        data: {
          clerkId: clerkUser.id,
          email,
          name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || null,
        },
      })
    }
  }

  // Reset monthly usage if needed
  const now = new Date()
  const resetDate = new Date(user.resetDate)
  if (now.getMonth() !== resetDate.getMonth() || now.getFullYear() !== resetDate.getFullYear()) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        videosThisMonth: 0,
        resetDate: now,
      },
    })
  }

  return user
}

export async function canProcessVideo(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  // TODO: Re-enable paywall after testing
  return { allowed: true }
}

export async function incrementVideoCount(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      videosThisMonth: { increment: 1 },
    },
  })
}

export async function getUserUsage(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      videos: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  })

  if (!user) return null

  const plan = PLANS[user.plan as PlanType]

  // TODO: Re-enable after testing
  return {
    plan: user.plan,
    planDetails: plan,
    videosUsed: 0,
    videosRemaining: 999999,
    recentVideos: user.videos as Video[],
  }
}
