export interface Article {
  slug: string
  title: string
  seoTitle: string
  description: string
  category: string
  readingTime: string
  date: string
  keyword: string
}

export const articles: Article[] = [
  // Vertical-Specific
  {
    slug: 'video-marketing-financial-advisors',
    title: 'Video Marketing for Financial Advisors (2026)',
    seoTitle: 'Video Marketing for Financial Advisors (2026)',
    description:
      'Learn how financial advisors use short-form video to build trust, attract high-net-worth clients, and grow AUM — without spending hours on content creation.',
    category: 'Financial Advisors',
    readingTime: '8 min read',
    date: '2026-02-15',
    keyword: 'video marketing for financial advisors',
  },
  {
    slug: 'video-content-real-estate-agents',
    title: 'Video Content Ideas for Real Estate Agents',
    seoTitle: 'Video Content Ideas for Real Estate Agents',
    description:
      'Discover 15+ video content ideas that help real estate agents generate leads, showcase listings, and build a personal brand on social media.',
    category: 'Real Estate',
    readingTime: '7 min read',
    date: '2026-02-12',
    keyword: 'video content ideas real estate agents',
  },
  {
    slug: 'social-media-video-mortgage-brokers',
    title: 'Social Media Video for Mortgage Brokers',
    seoTitle: 'Social Media Video for Mortgage Brokers',
    description:
      'How mortgage brokers use social media video to explain rates, educate buyers, and become the go-to lender in their market.',
    category: 'Mortgage Brokers',
    readingTime: '7 min read',
    date: '2026-02-10',
    keyword: 'social media video mortgage brokers',
  },
  {
    slug: 'video-marketing-lawyers',
    title: 'Video Marketing for Lawyers & Law Firms',
    seoTitle: 'Video Marketing for Lawyers & Law Firms',
    description:
      'Why law firms that post video get 3x more inquiries — and how to create compliant, trust-building content without a production team.',
    category: 'Lawyers',
    readingTime: '8 min read',
    date: '2026-02-08',
    keyword: 'video marketing for lawyers',
  },
  {
    slug: 'video-marketing-health-practitioners',
    title: 'Video Marketing for Health Practitioners',
    seoTitle: 'Video Marketing for Health Practitioners',
    description:
      'A practical guide to video marketing for chiropractors, dentists, physiotherapists, and other health professionals who want more patients.',
    category: 'Health Practitioners',
    readingTime: '7 min read',
    date: '2026-02-05',
    keyword: 'video marketing health practitioners',
  },
  {
    slug: 'video-content-side-hustlers',
    title: 'Video Content Strategy for Side Hustlers',
    seoTitle: 'Video Content Strategy for Side Hustlers',
    description:
      'How side hustlers and solopreneurs build an audience and drive sales with consistent video content — even with a full-time job.',
    category: 'Side Hustlers',
    readingTime: '6 min read',
    date: '2026-02-03',
    keyword: 'video content strategy side hustle',
  },
  // Feature-Focused
  {
    slug: 'ai-silence-removal-video-editing',
    title: 'AI Silence Removal: Edit Videos in Seconds',
    seoTitle: 'AI Silence Removal: Edit Videos in Seconds',
    description:
      'How AI-powered silence removal transforms raw footage into polished, fast-paced videos — automatically cutting dead air, ums, and awkward pauses.',
    category: 'Features',
    readingTime: '5 min read',
    date: '2026-01-28',
    keyword: 'ai silence removal video',
  },
  {
    slug: 'auto-captions-video-engagement',
    title: 'Auto Captions: Boost Video Engagement by 80%',
    seoTitle: 'Auto Captions: Boost Video Engagement by 80%',
    description:
      'Studies show captions increase video engagement by 80%. Learn how auto-captioning tools make every video accessible and scroll-stopping.',
    category: 'Features',
    readingTime: '5 min read',
    date: '2026-01-25',
    keyword: 'auto captions video',
  },
  {
    slug: 'instagram-video-scheduling-guide',
    title: 'Instagram Video Scheduling: Complete Guide',
    seoTitle: 'Instagram Video Scheduling: Complete Guide',
    description:
      'The complete guide to scheduling Instagram Reels and video posts — best times, batch workflows, and the tools that actually auto-post.',
    category: 'Features',
    readingTime: '6 min read',
    date: '2026-01-22',
    keyword: 'instagram video scheduling',
  },
  {
    slug: 'ai-script-generation-social-media',
    title: 'AI Script Generation for Social Media Videos',
    seoTitle: 'AI Script Generation for Social Media Videos',
    description:
      'How AI script generators help professionals create weeks of video content without writer\'s block — tailored scripts for your industry in seconds.',
    category: 'Features',
    readingTime: '6 min read',
    date: '2026-01-20',
    keyword: 'ai script generation social media',
  },
  // Comparison
  {
    slug: 'timeback-vs-capcut-vs-descript',
    title: 'TimeBack vs CapCut vs Descript (2026)',
    seoTitle: 'TimeBack vs CapCut vs Descript (2026)',
    description:
      'An honest comparison of TimeBack, CapCut, and Descript — features, pricing, ease of use, and which tool is best for different creators.',
    category: 'Comparison',
    readingTime: '8 min read',
    date: '2026-01-15',
    keyword: 'timeback vs capcut vs descript',
  },
  {
    slug: 'best-video-tools-small-business',
    title: 'Best Video Content Tools for Small Businesses',
    seoTitle: 'Best Video Content Tools for Small Businesses',
    description:
      'A curated list of the best video content tools for small businesses in 2026 — from scripting to editing to scheduling, ranked by value.',
    category: 'Comparison',
    readingTime: '7 min read',
    date: '2026-01-12',
    keyword: 'best video content tools small business',
  },
  // Strategy
  {
    slug: 'create-30-days-video-content-one-hour',
    title: 'Create 30 Days of Video Content in One Hour',
    seoTitle: 'Create 30 Days of Video Content in One Hour',
    description:
      'The exact batch workflow professionals use to plan, record, edit, and schedule a full month of video content in a single session.',
    category: 'Strategy',
    readingTime: '7 min read',
    date: '2026-01-08',
    keyword: 'batch create video content',
  },
  {
    slug: 'short-form-video-strategy-professionals',
    title: 'Short-Form Video Strategy for Professionals',
    seoTitle: 'Short-Form Video Strategy for Professionals',
    description:
      'Why short-form video is the highest-ROI marketing channel for professionals — and a simple strategy to start posting consistently.',
    category: 'Strategy',
    readingTime: '6 min read',
    date: '2026-01-05',
    keyword: 'short form video strategy professionals',
  },
  {
    slug: 'why-professionals-struggle-content-creation',
    title: 'Why Professionals Struggle With Content Creation',
    seoTitle: 'Why Professionals Struggle With Content Creation',
    description:
      'The 5 reasons busy professionals fail at content creation — and how to overcome each one with systems, not willpower.',
    category: 'Strategy',
    readingTime: '6 min read',
    date: '2026-01-02',
    keyword: 'professional content creation challenges',
  },
]

export function getRelatedArticles(currentSlug: string, count = 3): Article[] {
  const current = articles.find(a => a.slug === currentSlug)
  if (!current) return articles.slice(0, count)

  // Prefer same category, then different
  const sameCategory = articles.filter(
    a => a.slug !== currentSlug && a.category === current.category
  )
  const otherCategory = articles.filter(
    a => a.slug !== currentSlug && a.category !== current.category
  )
  return [...sameCategory, ...otherCategory].slice(0, count)
}
