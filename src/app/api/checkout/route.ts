import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { stripe, STRIPE_PRICES } from '@/lib/stripe'
import { getOrCreateUser } from '@/lib/user'
import { prisma } from '@/lib/db'

export async function POST(req: Request) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.redirect(new URL('/sign-in', req.url))
    }

    const formData = await req.formData()
    const plan = formData.get('plan') as 'PRO' | 'BUSINESS'

    if (!plan || !['PRO', 'BUSINESS'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    const user = await getOrCreateUser()

    if (!user) {
      return NextResponse.redirect(new URL('/sign-in', req.url))
    }

    // Get or create Stripe customer
    let customerId = user.stripeCustomerId

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          userId: user.id,
          clerkId: user.clerkId,
        },
      })
      customerId = customer.id

      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customerId },
      })
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: STRIPE_PRICES[plan],
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?canceled=true`,
      metadata: {
        userId: user.id,
        plan,
      },
    })

    return NextResponse.redirect(session.url!, { status: 303 })
  } catch (error) {
    console.error('Checkout error:', error)
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
