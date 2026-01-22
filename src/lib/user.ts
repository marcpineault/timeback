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
    user = await prisma.user.create({
      data: {
        clerkId: clerkUser.id,
        email: clerkUser.emailAddresses[0]?.emailAddress || '',
        name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || null,
      },
    })
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
  const user = await prisma.user.findUnique({
    where: { id: userId },
  })

  if (!user) {
    return { allowed: false, reason: 'User not found' }
  }

  const plan = PLANS[user.plan as PlanType]

  if (user.videosThisMonth >= plan.videosPerMonth) {
    return {
      allowed: false,
      reason: `You've reached your limit of ${plan.videosPerMonth} videos this month. Upgrade to process more.`
    }
  }

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

  return {
    plan: user.plan,
    planDetails: plan,
    videosUsed: user.videosThisMonth,
    videosRemaining: plan.videosPerMonth - user.videosThisMonth,
    recentVideos: user.videos as Video[],
  }
}
