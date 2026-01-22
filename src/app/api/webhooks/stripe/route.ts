import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/db'
import Stripe from 'stripe'

export async function POST(req: Request) {
  const body = await req.text()
  const signature = req.headers.get('stripe-signature')!

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session

        if (session.mode === 'subscription' && session.subscription) {
          const userId = session.metadata?.userId
          const plan = session.metadata?.plan as 'PRO' | 'BUSINESS'

          if (userId && plan) {
            await prisma.user.update({
              where: { id: userId },
              data: {
                plan,
                stripeSubscriptionId: session.subscription as string,
              },
            })
          }
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string

        const user = await prisma.user.findFirst({
          where: { stripeCustomerId: customerId },
        })

        if (user) {
          // Check if subscription is active
          if (subscription.status === 'active') {
            // Get price to determine plan
            const priceId = subscription.items.data[0]?.price.id

            let plan: 'FREE' | 'PRO' | 'BUSINESS' = 'FREE'
            if (priceId === process.env.STRIPE_PRO_PRICE_ID) {
              plan = 'PRO'
            } else if (priceId === process.env.STRIPE_BUSINESS_PRICE_ID) {
              plan = 'BUSINESS'
            }

            await prisma.user.update({
              where: { id: user.id },
              data: {
                plan,
                stripeSubscriptionId: subscription.id,
              },
            })
          }
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string

        await prisma.user.updateMany({
          where: { stripeCustomerId: customerId },
          data: {
            plan: 'FREE',
            stripeSubscriptionId: null,
          },
        })
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string

        // Could send email notification here
        console.log(`Payment failed for customer ${customerId}`)
        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook handler error:', error)
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    )
  }
}
