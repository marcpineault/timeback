export const PLANS = {
  FREE: {
    name: 'Starter',
    price: 0,
    videosPerMonth: 5,
    ideateGenerationsPerMonth: 3,
    maxDuration: 5 * 60, // 5 minutes
    maxResolution: 720,
    watermark: true,
    features: [
      '5 videos per month',
      '3 AI idea generations per month',
      'Up to 5 min videos',
      '720p max resolution',
      'TimeBack watermark',
    ],
  },
  PRO: {
    name: 'Creator',
    price: 19,
    priceId: process.env.STRIPE_PRO_PRICE_ID,
    videosPerMonth: 120,
    ideateGenerationsPerMonth: 50,
    maxDuration: 5 * 60, // 5 minutes
    maxResolution: 1080,
    watermark: false,
    features: [
      '120 videos per month',
      '50 AI idea generations per month',
      'Up to 5 min videos',
      '1080p resolution',
      'No watermark',
      'Priority processing',
    ],
  },
  CREATOR: {
    name: 'Business',
    price: 49,
    priceId: process.env.STRIPE_CREATOR_PRICE_ID,
    videosPerMonth: 250,
    ideateGenerationsPerMonth: 200,
    maxDuration: 10 * 60, // 10 minutes
    maxResolution: 1080,
    watermark: false,
    features: [
      '250 videos per month',
      '200 AI idea generations per month',
      'Up to 10 min videos',
      '1080p resolution',
      'No watermark',
      'Priority processing',
      'Perfect for TikTok, Reels & Shorts',
    ],
  },
  ENTERPRISE: {
    name: 'Enterprise',
    price: null, // Contact for pricing
    priceId: null,
    videosPerMonth: null, // Unlimited
    ideateGenerationsPerMonth: null, // Unlimited
    maxDuration: null, // Unlimited
    maxResolution: 2160,
    watermark: false,
    features: [
      'Unlimited videos',
      'Unlimited AI idea generations',
      'Unlimited duration',
      '4K resolution',
      'No watermark',
      'Priority processing',
      'API access',
      'Dedicated support',
      'Custom integrations',
    ],
  },
} as const

export type PlanType = keyof typeof PLANS
