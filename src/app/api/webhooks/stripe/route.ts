import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/db'
import Stripe from 'stripe'
import { logger } from '@/lib/logger'

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
    logger.error('Webhook signature verification failed', { error: String(err) })
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

        logger.warn('Payment failed for customer', { customerId })

        // Check if this is a final failure (subscription will be canceled)
        // Stripe sends payment_failed events for each retry attempt
        // We downgrade after 3 failed attempts or when the subscription status changes
        const subscription = invoice.subscription
        if (subscription) {
          const sub = await stripe.subscriptions.retrieve(subscription as string)

          // If subscription is past_due or unpaid after retries, downgrade user
          if (sub.status === 'past_due' || sub.status === 'unpaid' || sub.status === 'canceled') {
            logger.info('Downgrading user due to failed payment', { customerId, status: sub.status })

            await prisma.user.updateMany({
              where: { stripeCustomerId: customerId },
              data: {
                plan: 'FREE',
                // Keep subscription ID for potential reactivation
              },
            })
          }
        }
        break
      }

      case 'customer.subscription.paused': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string

        logger.info('Subscription paused, downgrading user', { customerId })

        await prisma.user.updateMany({
          where: { stripeCustomerId: customerId },
          data: {
            plan: 'FREE',
          },
        })
        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    logger.error('Webhook handler error', { error: String(error) })
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    )
  }
}
