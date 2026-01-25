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
    maxDuration: 30 * 60, // 30 minutes
    maxResolution: 1080,
    watermark: false,
    features: [
      '30 videos per month',
      'Up to 30 min videos',
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
    maxDuration: 60 * 60, // 60 minutes
    maxResolution: 2160,
    watermark: false,
    features: [
      '100 videos per month',
      'Up to 60 min videos',
      '4K resolution',
      'No watermark',
      'Priority processing',
      'API access',
    ],
  },
} as const

export type PlanType = keyof typeof PLANS
