import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// One-time admin endpoint to upgrade account to ENTERPRISE
// DELETE THIS FILE after use for security
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')

  // Simple secret to prevent random access
  if (secret !== 'marc-enterprise-2026') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const email = 'mpineault1@gmail.com'

  try {
    const user = await prisma.user.findUnique({
      where: { email },
    })

    if (!user) {
      return NextResponse.json({ error: `User with email ${email} not found` }, { status: 404 })
    }

    const updatedUser = await prisma.user.update({
      where: { email },
      data: { plan: 'ENTERPRISE' },
    })

    return NextResponse.json({
      success: true,
      message: `Upgraded ${updatedUser.email} to ENTERPRISE plan`,
      user: {
        email: updatedUser.email,
        name: updatedUser.name,
        plan: updatedUser.plan,
      },
    })
  } catch (error) {
    console.error('Error upgrading user:', error)
    return NextResponse.json({ error: 'Failed to upgrade user' }, { status: 500 })
  }
}
