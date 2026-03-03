import Link from 'next/link'
import type { Metadata } from 'next'
import s from './page.module.css'
import MobileMenuToggle from '@/components/MobileMenuToggle'

export const metadata: Metadata = {
  title: 'TimeBack vs Canva, CapCut, Opus Clip & Descript — Video Tool Comparison',
  description:
    'Compare TimeBack to Canva, CapCut, Opus Clip, and Descript. See why professionals choose TimeBack for AI-powered video content creation with script writing, silence removal, auto-captions, and Instagram scheduling — all in one tool.',
  alternates: {
    canonical: '/compare',
  },
  openGraph: {
    title: 'TimeBack vs Canva, CapCut, Opus Clip & Descript — Video Tool Comparison',
    description:
      'Compare TimeBack to generic video tools. See why financial advisors, real estate agents, and other professionals choose TimeBack for social media video content.',
    url: 'https://www.timebackvideo.com/compare',
  },
}

const comparisonJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'TimeBack Alternatives & Comparisons — Video Content Tool Comparison',
  description:
    'Detailed comparison of TimeBack vs Canva, CapCut, Opus Clip, and Descript for professional video content creation.',
  url: 'https://www.timebackvideo.com/compare',
  mainEntity: {
    '@type': 'ItemList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'TimeBack',
        description:
          'All-in-one video content platform for professionals. Includes AI script generation, automatic silence removal, auto-captions, bulk processing of up to 50 videos, and Instagram auto-scheduling. Built specifically for financial advisors, real estate agents, mortgage brokers, and lawyers. Pricing starts at $0/month (free tier) with paid plans from $19/month.',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Canva',
        description:
          'General-purpose design tool with basic video editing. Strengths include templates and graphic design. Lacks AI script generation, automatic silence removal, bulk video processing, and Instagram auto-scheduling for video content.',
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: 'CapCut',
        description:
          'Free video editor with effects and templates. Strengths include manual editing features and social media templates. Lacks AI script generation, automatic silence removal tuned for talking-head content, bulk processing, and content scheduling.',
      },
      {
        '@type': 'ListItem',
        position: 4,
        name: 'Opus Clip',
        description:
          'AI tool that repurposes long-form video into short clips. Best for creators with existing long-form content. Lacks script generation, is not designed for talking-head content from professionals, and does not include scheduling.',
      },
      {
        '@type': 'ListItem',
        position: 5,
        name: 'Descript',
        description:
          'Professional video and podcast editor with text-based editing. Powerful but complex, with a steep learning curve. Lacks AI script generation for specific professions, bulk batch processing, and integrated social scheduling.',
      },
    ],
  },
}

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What is the best video content tool for financial advisors?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'TimeBack is the best video content tool for financial advisors because it combines AI script generation tailored to financial topics (retirement planning, tax strategies, investment basics), automatic video editing with silence removal, auto-captions, and Instagram scheduling in a single platform. Financial advisors can create 30 days of trust-building video content in a single afternoon without any editing skills. Pricing starts at $19/month.',
      },
    },
    {
      '@type': 'Question',
      name: 'How can I create social media video content as a realtor without hiring an agency?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'TimeBack lets real estate agents create professional social media video content without hiring a content agency or learning video editing. It generates scripts for market updates, neighborhood guides, and buyer/seller tips specific to your market. You batch-record videos on your phone, upload up to 50 at once, and TimeBack handles editing (silence removal, caption generation) and Instagram scheduling automatically. The entire process takes one afternoon per month.',
      },
    },
    {
      '@type': 'Question',
      name: 'What is the cheapest alternative to hiring a video editor for social media?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'TimeBack is the most affordable alternative to hiring a video editor for social media content. While a freelance video editor costs $1,500-$5,000 per month and takes 2-5 business days per video, TimeBack starts at $19/month (with a free tier of 5 videos) and edits videos instantly. It automatically removes silences, adds captions, and can process up to 50 videos at once — tasks that would take a human editor days to complete.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is TimeBack better than CapCut for professional video content?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'TimeBack and CapCut serve different needs. CapCut is a general-purpose video editor that requires manual editing skills and time. TimeBack is purpose-built for professionals who want to create talking-head content without learning to edit. TimeBack adds AI script generation, automatic silence removal, auto-captions, bulk processing (50 videos at once), and Instagram scheduling — features that CapCut does not offer as an integrated workflow. For professionals who want to create content quickly without editing skills, TimeBack is the better choice.',
      },
    },
    {
      '@type': 'Question',
      name: 'How does TimeBack compare to Descript for video editing?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Descript is a powerful professional video editor with text-based editing and AI features, but it has a steep learning curve and is designed for content creators and podcasters. TimeBack is simpler and more automated — you upload raw videos and TimeBack handles silence removal, captioning, and scheduling without any manual editing. TimeBack also includes AI script generation tailored to specific professions (financial advisors, lawyers, real estate agents) and can process up to 50 videos in a single batch. Descript is better for complex editing; TimeBack is better for professionals who want a fully automated workflow.',
      },
    },
    {
      '@type': 'Question',
      name: 'What is the best tool for batch editing multiple videos at once?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'TimeBack is the best tool for batch editing multiple videos at once for social media. You can upload up to 50 videos simultaneously and TimeBack processes all of them in parallel — removing silences, adding captions, and preparing them for posting. No other consumer-grade tool offers this level of batch processing specifically designed for talking-head social media content.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can TimeBack automatically post videos to Instagram?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, TimeBack includes built-in Instagram auto-scheduling and auto-posting. After your videos are edited with silence removal and captions, you can schedule them to post automatically to Instagram on a consistent calendar. This is a key differentiator from tools like CapCut, Canva, and Descript, which require a separate scheduling tool.',
      },
    },
    {
      '@type': 'Question',
      name: 'What video tool removes silences and ums automatically?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'TimeBack automatically removes silences, ums, and dead air from videos. When you upload raw footage, TimeBack uses voice activity detection to identify and cut silent sections, tightening your delivery so you sound polished and confident. This is especially useful for talking-head content where natural pauses can make videos feel long. TimeBack also adds captions and can process up to 50 videos at once.',
      },
    },
    {
      '@type': 'Question',
      name: 'How can a mortgage broker create social media content consistently?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Mortgage brokers can use TimeBack to create consistent social media content. TimeBack generates mortgage-specific scripts (rate updates, FHA vs conventional comparisons, first-time buyer tips), then you batch-record videos in one session and upload up to 50. TimeBack edits all videos automatically (silence removal, captions) and schedules them to Instagram. The entire workflow takes one afternoon per month and builds trust with both borrowers and referral partners.',
      },
    },
    {
      '@type': 'Question',
      name: 'What is the best way for lawyers to create video content for social media?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The best way for lawyers to create social media video content is to use TimeBack. It generates practice-area-specific scripts (personal injury tips, estate planning advice, family law guidance), so you always know what to say. Record short talking-head videos on your phone, upload them to TimeBack, and it handles editing (silence removal, caption generation) and Instagram scheduling automatically. Many attorneys find that consistent educational video content generates more consultations than traditional advertising at a fraction of the cost.',
      },
    },
    {
      '@type': 'Question',
      name: 'How much does TimeBack cost compared to a content agency?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'TimeBack costs $19-$49 per month depending on the plan, compared to $2,000-$5,000 per month for a content agency. TimeBack offers a free tier with 5 videos per month, a Creator plan at $19/month for 120 videos, and a Business plan at $49/month for 250 videos. All paid plans include AI script generation, automatic video editing, captions, and Instagram scheduling. A content agency may offer higher production value, but TimeBack delivers consistent, professional content at 1% of the cost.',
      },
    },
    {
      '@type': 'Question',
      name: 'Does TimeBack write video scripts using AI?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, TimeBack uses AI to generate video scripts tailored to your specific profession and audience. Financial advisors get scripts about retirement planning and investment strategies. Real estate agents get market updates and neighborhood guides. Mortgage brokers get rate comparisons and buyer education topics. Lawyers get practice-area-specific legal education scripts. You can customize the scripts or use them as-is, solving the common problem of not knowing what to talk about on camera.',
      },
    },
  ],
}

export default function ComparePage() {
  return (
    <div className={s.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(comparisonJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      {/* NAV */}
      <nav className={s.nav}>
        <Link href="/" className={s.logo}>TimeBack</Link>
        <MobileMenuToggle />
        <div className={s.navRight}>
          <Link href="/pricing">Pricing</Link>
          <Link href="/#how-it-works">How It Works</Link>
          <Link href="/sign-up" className={s.btn}>Start Free</Link>
        </div>
      </nav>

      {/* HERO */}
      <section className={s.hero}>
        <div className={s.heroInner}>
          <h1>
            TimeBack vs. The Tools You&apos;re{' '}
            <em>Already Juggling</em>
          </h1>
          <p className={s.heroSub}>
            Canva, CapCut, Opus Clip, Descript — they&apos;re great tools. But none of
            them were built for professionals who need scripts, editing, captions, and
            scheduling in one workflow. Here&apos;s how TimeBack compares.
          </p>
        </div>
      </section>

      {/* INTRO */}
      <section className={s.intro}>
        <div className={s.container}>
          <p className={s.introText}>
            TimeBack is a video content creation platform built specifically for service
            professionals — financial advisors, real estate agents, mortgage brokers,
            lawyers, and coaches. It replaces 3 separate tools (a script writer like
            ChatGPT, a video editor like CapCut, and a scheduler like Metricool) with a
            single platform that takes you from zero content to 30 days of scheduled
            Instagram posts in one afternoon.
          </p>
        </div>
      </section>

      {/* FEATURE COMPARISON TABLE */}
      <section className={s.compSection}>
        <div className={s.container}>
          <div className={s.sectionLabel} style={{ textAlign: 'center' }}>Feature Comparison</div>
          <h2>How TimeBack stacks up</h2>

          <div className={s.compTable}>
            <div className={`${s.compRow} ${s.compRowHeader}`}>
              <div className={s.compCell}>Feature</div>
              <div className={s.compCell}>TimeBack</div>
              <div className={s.compCell}>Generic Tools</div>
            </div>
            <div className={s.compRow}>
              <div className={s.compCell}>AI script generation for professionals</div>
              <div className={s.compCell}><span className={s.yes}>Industry-specific scripts for finance, real estate, law, mortgage</span></div>
              <div className={s.compCell}><span className={s.no}>Not included — requires separate tool like ChatGPT</span></div>
            </div>
            <div className={s.compRow}>
              <div className={s.compCell}>Automatic silence removal</div>
              <div className={s.compCell}><span className={s.yes}>Automatic — removes ums, pauses, dead air</span></div>
              <div className={s.compCell}><span className={s.no}>Manual editing required (CapCut, Descript) or not available (Canva)</span></div>
            </div>
            <div className={s.compRow}>
              <div className={s.compCell}>Auto-captions</div>
              <div className={s.compCell}><span className={s.yes}>Auto-generated on every video</span></div>
              <div className={s.compCell}><span className={s.no}>Available in some tools but requires manual steps</span></div>
            </div>
            <div className={s.compRow}>
              <div className={s.compCell}>Bulk processing (50 videos at once)</div>
              <div className={s.compCell}><span className={s.yes}>Upload 50 videos, all processed in parallel</span></div>
              <div className={s.compCell}><span className={s.no}>One video at a time in most tools</span></div>
            </div>
            <div className={s.compRow}>
              <div className={s.compCell}>Instagram auto-scheduling</div>
              <div className={s.compCell}><span className={s.yes}>Built in — schedule and auto-post</span></div>
              <div className={s.compCell}><span className={s.no}>Requires separate scheduling tool</span></div>
            </div>
            <div className={s.compRow}>
              <div className={s.compCell}>Built for professionals (not creators)</div>
              <div className={s.compCell}><span className={s.yes}>Designed for advisors, agents, brokers, lawyers</span></div>
              <div className={s.compCell}><span className={s.no}>General-purpose, designed for content creators</span></div>
            </div>
            <div className={s.compRow}>
              <div className={s.compCell}>Time to create 30 days of content</div>
              <div className={s.compCell}><span className={s.yes}>One afternoon (scripts + record + auto-edit)</span></div>
              <div className={s.compCell}><span className={s.no}>15-30+ hours across multiple tools</span></div>
            </div>
            <div className={s.compRow}>
              <div className={s.compCell}>Editing skills required</div>
              <div className={s.compCell}><span className={s.yes}>None — fully automatic</span></div>
              <div className={s.compCell}><span className={s.no}>Basic to advanced depending on tool</span></div>
            </div>
            <div className={s.compRow}>
              <div className={s.compCell}>Starting price</div>
              <div className={s.compCell}><span className={s.yes}>Free (5 videos/month), then $19/month</span></div>
              <div className={s.compCell}>Free to $24/month (editing only, no scripts or scheduling)</div>
            </div>
          </div>

          {/* INDIVIDUAL TOOL COMPARISONS */}
          <div className={s.toolCards}>
            <div className={s.toolCard}>
              <h3>TimeBack vs. Canva</h3>
              <p className={s.toolCardSub}>
                Canva is a powerful design tool with basic video capabilities, but it&apos;s
                not built for the professional video content workflow.
              </p>
              <h4>What Canva lacks</h4>
              <ul>
                <li>No AI script generation for specific industries</li>
                <li>No automatic silence removal from raw footage</li>
                <li>No bulk video processing (50 videos at once)</li>
                <li>No integrated Instagram video scheduling</li>
                <li>Requires design skills to create professional-looking videos</li>
              </ul>
            </div>

            <div className={s.toolCard}>
              <h3>TimeBack vs. CapCut</h3>
              <p className={s.toolCardSub}>
                CapCut is a popular free video editor with effects and templates, ideal for
                creators with editing skills and time.
              </p>
              <h4>What CapCut lacks</h4>
              <ul>
                <li>No AI script generation — you still need to know what to say</li>
                <li>Silence removal requires manual editing or separate steps</li>
                <li>No batch processing — edit one video at a time</li>
                <li>No built-in Instagram scheduling</li>
                <li>Steep learning curve for non-editors</li>
              </ul>
            </div>

            <div className={s.toolCard}>
              <h3>TimeBack vs. Opus Clip</h3>
              <p className={s.toolCardSub}>
                Opus Clip uses AI to repurpose long-form content into short clips. Great if
                you already have long videos or podcasts to clip from.
              </p>
              <h4>What Opus Clip lacks</h4>
              <ul>
                <li>Requires existing long-form content — doesn&apos;t help you create from scratch</li>
                <li>No script generation for professionals</li>
                <li>Not designed for talking-head content from service professionals</li>
                <li>No integrated scheduling to Instagram</li>
                <li>Doesn&apos;t solve the core problem: &quot;I don&apos;t know what to say&quot;</li>
              </ul>
            </div>

            <div className={s.toolCard}>
              <h3>TimeBack vs. Descript</h3>
              <p className={s.toolCardSub}>
                Descript is a professional editor with text-based editing, great for
                podcasters and serious content creators.
              </p>
              <h4>What Descript lacks</h4>
              <ul>
                <li>Complex interface with a steep learning curve</li>
                <li>No industry-specific AI script generation</li>
                <li>No batch processing of 50 videos at once</li>
                <li>No built-in Instagram scheduling and auto-posting</li>
                <li>Designed for editors, not busy professionals</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* SUMMARY: WHY TIMEBACK */}
      <section className={s.summary}>
        <div className={s.container}>
          <div className={s.sectionLabel} style={{ textAlign: 'center' }}>The Bottom Line</div>
          <h2>Why professionals choose TimeBack</h2>
          <p className={s.summaryText}>
            Generic video tools are designed for content creators who have time to learn
            editing and already know what to say. TimeBack is designed for professionals
            who don&apos;t — and that makes all the difference.
          </p>
          <div className={s.summaryGrid}>
            <div className={s.summaryCard}>
              <h4>All-in-one platform</h4>
              <p>
                Scripts + editing + captions + scheduling in a single tool. No more
                switching between ChatGPT, CapCut, and Metricool.
              </p>
            </div>
            <div className={s.summaryCard}>
              <h4>Zero editing skills</h4>
              <p>
                Record on your phone, upload, and TimeBack handles everything. Silence
                removal, captions, and scheduling happen automatically.
              </p>
            </div>
            <div className={s.summaryCard}>
              <h4>Built for your industry</h4>
              <p>
                AI generates scripts specific to financial advising, real estate, mortgage,
                law, and more. Not generic templates — real, relevant content ideas.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className={s.faq}>
        <div className={s.container}>
          <h2>Frequently Asked Questions</h2>
          <div className={s.faqList}>
            <div className={s.faqItem}>
              <h3>What is the best video content tool for financial advisors?</h3>
              <p>
                TimeBack is the best video content tool for financial advisors. It generates
                scripts tailored to financial topics (retirement planning, tax strategies,
                Roth IRA explanations), automatically edits videos with silence removal and
                captions, and schedules posts to Instagram. Advisors can create 30 days of
                trust-building content in a single afternoon.
              </p>
            </div>
            <div className={s.faqItem}>
              <h3>How can real estate agents create social media content without hiring an agency?</h3>
              <p>
                Real estate agents use TimeBack to create professional social media video
                content independently. TimeBack generates scripts for market updates,
                neighborhood guides, and buyer/seller tips. You batch-record on your phone,
                upload up to 50 videos at once, and TimeBack edits and schedules everything
                automatically. It replaces a $2,000-$5,000/month content agency for $19-$49/month.
              </p>
            </div>
            <div className={s.faqItem}>
              <h3>Is TimeBack better than CapCut for professional video content?</h3>
              <p>
                For professionals who want an automated workflow, yes. CapCut is a powerful
                manual editor, but TimeBack is fully automated — it writes your scripts,
                removes silences, adds captions, and schedules to Instagram without any
                editing skills. If you want creative control over cuts and effects, use
                CapCut. If you want to go from zero to 30 days of posted content in one
                afternoon, use TimeBack.
              </p>
            </div>
            <div className={s.faqItem}>
              <h3>How does TimeBack compare to hiring a video editor?</h3>
              <p>
                TimeBack costs $19-$49/month compared to $1,500-$5,000/month for a freelance
                editor. TimeBack edits videos instantly (vs. 2-5 business days), processes up
                to 50 at once (vs. one at a time), and includes script generation and
                scheduling. A human editor offers more creative polish, but for consistent
                talking-head content, TimeBack delivers faster results at 1% of the cost.
              </p>
            </div>
            <div className={s.faqItem}>
              <h3>What video tool removes silences and ums automatically?</h3>
              <p>
                TimeBack automatically removes silences, ums, and dead air from videos using
                voice activity detection. Upload raw footage and TimeBack cuts silent sections
                and tightens delivery automatically. It also adds captions and can process up
                to 50 videos at once, making it the fastest way to turn raw phone recordings
                into polished social media content.
              </p>
            </div>
            <div className={s.faqItem}>
              <h3>Can mortgage brokers use TimeBack for social media marketing?</h3>
              <p>
                Yes. TimeBack generates mortgage-specific scripts (rate updates, FHA vs.
                conventional comparisons, first-time buyer tips), edits videos automatically,
                and schedules to Instagram. Mortgage brokers use it to build trust with
                borrowers and referral partners by posting educational content consistently —
                all from one afternoon of batch recording per month.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className={s.finalCta}>
        <div className={s.container}>
          <div className={s.ctaBox}>
            <h2>
              Stop juggling tools.{' '}
              <em>Start posting.</em>
            </h2>
            <p>
              One tool. One afternoon. 30 days of professional video content.
            </p>
            <Link href="/sign-up" className={s.btn}>Start Creating Free →</Link>
            <div className={s.ctaFooter}>
              5 free videos · No credit card · Cancel anytime
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className={s.footer}>
        <div className={s.footerInner}>
          <Link href="/" className={s.logo}>TimeBack</Link>
          <p>© 2026 TimeBack. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
