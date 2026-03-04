import Link from 'next/link'
import type { Metadata } from 'next'
import { articles } from './articles'
import BlogNav from '@/components/BlogNav'
import BlogFooter from '@/components/BlogFooter'
import s from './blog.module.css'

export const metadata: Metadata = {
  title: 'Blog — Video Marketing Tips & Strategies | TimeBack',
  description:
    'Video marketing guides, AI editing tips, and content strategies for financial advisors, real estate agents, mortgage brokers, lawyers, and other professionals.',
  alternates: {
    canonical: '/blog',
  },
  openGraph: {
    title: 'Blog — Video Marketing Tips & Strategies | TimeBack',
    description:
      'Video marketing guides, AI editing tips, and content strategies for professionals.',
    url: 'https://www.timebackvideo.com/blog',
  },
}

const collectionJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'TimeBack Blog',
  description:
    'Video marketing guides, AI editing tips, and content strategies for professionals.',
  url: 'https://www.timebackvideo.com/blog',
  publisher: {
    '@type': 'Organization',
    name: 'TimeBack',
    url: 'https://www.timebackvideo.com',
  },
}

export default function BlogIndex() {
  return (
    <div className={s.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }}
      />

      <BlogNav />

      {/* HERO */}
      <section className={s.hero}>
        <div className={s.heroInner}>
          <div className={s.heroBadge}>
            <span className={s.dot}></span> Blog
          </div>
          <h1>
            Video Marketing Tips for <em>Professionals</em>
          </h1>
          <p>
            Guides, strategies, and AI tips to help you create better video
            content in less time — no matter your industry.
          </p>
        </div>
      </section>

      {/* CARD GRID */}
      <div className={s.grid}>
        {articles.map(article => (
          <Link
            key={article.slug}
            href={`/blog/${article.slug}`}
            className={s.card}
          >
            <div className={s.cardCategory}>{article.category}</div>
            <h3>{article.title}</h3>
            <p>{article.description}</p>
            <div className={s.cardMeta}>{article.readingTime}</div>
          </Link>
        ))}
      </div>

      <BlogFooter />
    </div>
  )
}
