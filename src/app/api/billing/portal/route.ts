import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { stripe } from '@/lib/stripe'
import { getOrCreateUser } from '@/lib/user'

export async function POST() {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await getOrCreateUser()

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!user.stripeCustomerId) {
      return NextResponse.json(
        { error: 'No billing account found. Please subscribe to a plan first.' },
        { status: 400 }
      )
    }

    // Create a Stripe billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/account/subscription`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Billing portal error:', error)
    return NextResponse.json(
      { error: 'Failed to create billing portal session' },
      { status: 500 }
    )
  }
}
