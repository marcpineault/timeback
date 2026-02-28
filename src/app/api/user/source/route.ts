import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { utmSource, utmMedium, utmCampaign, utmContent, utmTerm, referrer, landingPage } = body

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { utmSource: true },
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // First-touch attribution — don't overwrite once set
  if (user.utmSource !== null) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  await prisma.user.update({
    where: { clerkId: userId },
    data: {
      utmSource: utmSource ?? null,
      utmMedium: utmMedium ?? null,
      utmCampaign: utmCampaign ?? null,
      utmContent: utmContent ?? null,
      utmTerm: utmTerm ?? null,
      referrer: referrer ?? null,
      landingPage: landingPage ?? null,
    },
  })

  return NextResponse.json({ ok: true })
}
