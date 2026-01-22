import Stripe from 'stripe'

const stripeSecretKey = process.env.STRIPE_SECRET_KEY

export const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey)
  : null as unknown as Stripe

export const STRIPE_PRICES = {
  PRO: process.env.STRIPE_PRO_PRICE_ID!,
  BUSINESS: process.env.STRIPE_BUSINESS_PRICE_ID!,
}
