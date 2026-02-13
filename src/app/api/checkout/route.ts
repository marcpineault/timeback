import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { stripe, STRIPE_PRICES } from '@/lib/stripe'
import { getOrCreateUser } from '@/lib/user'
import { prisma } from '@/lib/db'
import { PLANS } from '@/lib/plans'

export async function POST(req: Request) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.redirect(new URL('/sign-in', req.url))
    }

    // Parse form data from URL-encoded body
    const text = await req.text()
    const params = new URLSearchParams(text)
    const plan = params.get('plan') as 'PRO' | 'CREATOR'

    if (!plan || !['PRO', 'CREATOR'].includes(plan)) {
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

    // Get plan details for description
    const planDetails = PLANS[plan]
    const planDescription = planDetails.features.join(' • ')

    // Check if user already has an active subscription - upgrade with proration
    if (user.stripeSubscriptionId) {
      try {
        // Retrieve the existing subscription
        const existingSubscription = await stripe.subscriptions.retrieve(
          user.stripeSubscriptionId
        )

        // Only upgrade if subscription is active and not canceled
        if (
          existingSubscription.status === 'active' &&
          !existingSubscription.cancel_at_period_end
        ) {
          const subscriptionItemId = existingSubscription.items.data[0]?.id

          if (subscriptionItemId) {
            // Update the subscription with proration
            // This gives credit for unused time on current plan
            await stripe.subscriptions.update(user.stripeSubscriptionId, {
              items: [
                {
                  id: subscriptionItemId,
                  price: STRIPE_PRICES[plan],
                },
              ],
              proration_behavior: 'create_prorations',
              metadata: {
                plan,
                videosPerMonth: planDetails.videosPerMonth.toString(),
                maxDuration: planDetails.maxDuration.toString(),
                maxResolution: planDetails.maxResolution.toString(),
              },
            })

            // Update user's plan in database immediately
            await prisma.user.update({
              where: { id: user.id },
              data: { plan },
            })

            // Redirect to thank-you page - upgrade is complete with proration
            return NextResponse.redirect(
              new URL(
                `/thank-you`,
                process.env.NEXT_PUBLIC_APP_URL
              ),
              { status: 303 }
            )
          }
        }
      } catch (subscriptionError) {
        // If subscription retrieval fails, fall through to create new checkout
        console.error(
          'Failed to upgrade existing subscription:',
          subscriptionError
        )
      }
    }

    // Create new checkout session for users without active subscription
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
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/thank-you`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?canceled=true`,
      metadata: {
        userId: user.id,
        plan,
      },
      subscription_data: {
        description: `TimeBack ${planDetails.name} Plan: ${planDescription}`,
        metadata: {
          plan,
          videosPerMonth: planDetails.videosPerMonth.toString(),
          maxDuration: planDetails.maxDuration.toString(),
          maxResolution: planDetails.maxResolution.toString(),
        },
      },
      custom_text: {
        submit: {
          message: `You're subscribing to the ${planDetails.name} plan which includes: ${planDescription}`,
        },
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
