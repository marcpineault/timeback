export const PLANS = {
  FREE: {
    name: 'Free',
    price: 0,
    videosPerMonth: 5,
    maxDuration: 5 * 60, // 5 minutes
    maxResolution: 720,
    watermark: true,
    features: [
      '5 videos per month',
      'Up to 5 min videos',
      '720p max resolution',
      'TimeBack watermark',
    ],
  },
  PRO: {
    name: 'Pro',
    price: 19,
    priceId: process.env.STRIPE_PRO_PRICE_ID,
    videosPerMonth: 30,
    maxDuration: 10 * 60, // 10 minutes
    maxResolution: 1080,
    watermark: false,
    features: [
      '30 videos per month',
      'Up to 10 min videos',
      '1080p resolution',
      'No watermark',
      'Priority processing',
    ],
  },
  BUSINESS: {
    name: 'Business',
    price: 49,
    priceId: process.env.STRIPE_BUSINESS_PRICE_ID,
    videosPerMonth: 100,
    maxDuration: 30 * 60, // 30 minutes
    maxResolution: 2160,
    watermark: false,
    features: [
      '100 videos per month',
      'Up to 30 min videos',
      '4K resolution',
      'No watermark',
      'Priority processing',
      'API access',
    ],
  },
  ENTERPRISE: {
    name: 'Enterprise',
    price: null, // Contact for pricing
    priceId: null,
    videosPerMonth: null, // Unlimited
    maxDuration: null, // Unlimited
    maxResolution: 2160,
    watermark: false,
    features: [
      'Unlimited videos',
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
