import Link from 'next/link'
import type { Metadata } from 'next'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import ScrollReveal from '@/components/ScrollReveal'
import IndustrySelector from '@/components/IndustrySelector'
import MobileMenuToggle from '@/components/MobileMenuToggle'
import BeforeAfterVideo from '@/components/BeforeAfterVideo'

export const metadata: Metadata = {
  title: 'TimeBack — Software That Edits Your Videos For You',
  description:
    'Upload your video and TimeBack does the rest. It adds captions, removes silences, and auto-posts to social media for you — so you never have to worry about your next video again.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'TimeBack — Software That Edits Your Videos For You',
    description:
      'Upload your video and TimeBack does the rest. It adds captions, removes silences, and auto-posts to social media for you — so you never have to worry about your next video again.',
    url: 'https://www.timebackvideo.com',
  },
}

const softwareAppJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'TimeBack',
  url: 'https://www.timebackvideo.com',
  applicationCategory: 'MultimediaApplication',
  operatingSystem: 'Web',
  description:
    'Timeback is software that edits your videos for you. Upload your video and Timeback does the rest — it adds captions, removes silences, and auto-posts to social media. Built for financial advisors, real estate agents, mortgage brokers, lawyers, and other service professionals.',
  offers: [
    {
      '@type': 'Offer',
      name: 'Starter',
      price: '19',
      priceCurrency: 'USD',
      description: '35 videos per month, AI script generation, auto silence removal, auto captions, Instagram scheduling',
    },
    {
      '@type': 'Offer',
      name: 'Creator',
      price: '39',
      priceCurrency: 'USD',
      description: '120 videos per month, bulk upload (50 at once), priority processing, advanced captions',
    },
  ],
  featureList: [
    'AI script generation tailored to specific professions',
    'Automatic video editing with silence and dead air removal',
    'Auto-captioning on every video',
    'Bulk upload and processing of up to 50 videos at once',
    'Instagram auto-scheduling and auto-posting',
    'Industry-specific content for financial advisors, real estate agents, mortgage brokers, and lawyers',
  ],
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: '4.9',
    ratingCount: '47',
    bestRating: '5',
  },
}

const howToJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'HowTo',
  name: 'How to create 30 days of social media video content in one afternoon with TimeBack',
  description:
    'A step-by-step guide to using TimeBack to go from zero content to a full month of scheduled Instagram posts in a single afternoon.',
  totalTime: 'PT2H',
  step: [
    {
      '@type': 'HowToStep',
      position: 1,
      name: 'Pick your topics',
      text: 'Tell TimeBack your industry (financial advisor, real estate agent, mortgage broker, lawyer, etc.) and target audience. AI generates a batch of scroll-stopping video scripts tailored to your profession that you can customize or use as-is. This takes about 5 minutes.',
    },
    {
      '@type': 'HowToStep',
      position: 2,
      name: 'Batch record and upload',
      text: 'Film your videos back to back on your phone. No teleprompter needed — just talk naturally using the AI-generated scripts. Upload up to 50 videos at once to TimeBack. This takes 1-2 hours.',
    },
    {
      '@type': 'HowToStep',
      position: 3,
      name: 'Auto-edit and auto-post',
      text: 'TimeBack automatically removes silences, ums, and dead air from every video, adds captions, polishes your cuts, and auto-schedules everything to Instagram. This step is fully automatic — you are done.',
    },
  ],
}

const homepageFaqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What is TimeBack?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Timeback is software that edits your videos for you. Upload your video and Timeback does the rest — it adds captions, removes silences, and auto-posts to social media so you never have to worry about your next video again. It combines AI script generation, automatic video editing, auto-captioning, and social media scheduling into a single tool. Built for financial advisors, real estate agents, mortgage brokers, lawyers, health practitioners, and coaches.',
      },
    },
    {
      '@type': 'Question',
      name: 'Who is TimeBack for?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'TimeBack is built for service professionals who want to grow their business through social media video but lack the time, skills, or content ideas. Core audiences include: financial advisors and wealth managers, real estate agents and realtors, mortgage brokers and loan officers, lawyers and attorneys (all practice areas), health practitioners (chiropractors, dentists, physiotherapists), coaches and consultants, personal trainers, and founders/CEOs building personal brands.',
      },
    },
    {
      '@type': 'Question',
      name: 'How much does TimeBack cost?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'TimeBack starts at $19/month (Starter plan with 35 videos, AI script generation, auto silence removal, auto captions, and Instagram scheduling). The Creator plan is $39/month with 120 videos, bulk upload of 50 at once, priority processing, and advanced captions. You get 5 free videos to try before you pay.',
      },
    },
    {
      '@type': 'Question',
      name: 'How does TimeBack compare to hiring a video editor or content agency?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'TimeBack costs $19-$39/month compared to $1,500-$5,000/month for a freelance editor or content agency. TimeBack edits videos instantly (vs. 2-5 business days), processes up to 50 at once (vs. one at a time), and includes AI script generation and Instagram scheduling. It replaces three tools — ChatGPT for scripts, CapCut for editing, and Metricool for scheduling — with a single platform.',
      },
    },
    {
      '@type': 'Question',
      name: 'Do I need video editing skills to use TimeBack?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No. TimeBack requires zero video editing skills. You record videos on your phone, upload them, and TimeBack handles everything automatically — silence removal, caption generation, and Instagram scheduling. The platform is specifically designed for busy professionals who don\'t have time to learn video editing software.',
      },
    },
    {
      '@type': 'Question',
      name: 'What makes TimeBack different from Canva, CapCut, or Descript?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'TimeBack is an all-in-one platform that combines script generation, video editing, captioning, and scheduling — while tools like Canva, CapCut, and Descript only handle editing. TimeBack also generates industry-specific scripts for professionals (financial advisors get scripts about investing, lawyers get scripts about legal topics), offers batch processing of up to 50 videos at once, and includes built-in Instagram auto-scheduling. Generic tools require multiple tools and editing skills; TimeBack is fully automated.',
      },
    },
  ],
}

export default async function LandingPage() {
  const { userId } = await auth()

  if (userId) {
    redirect('/dashboard')
  }

  return (
    <div className="landing-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homepageFaqJsonLd) }}
      />
      <ScrollReveal />

      {/* NAV */}
      <nav className="lp-nav">
        <Link href="/" className="nav-logo">TimeBack</Link>
        <MobileMenuToggle />
        <div className="nav-links">
          <a href="#how-it-works">How It Works</a>
          <a href="#pricing">Pricing</a>
          <Link href="/blog">Blog</Link>
          <a
            href="https://www.youtube.com/playlist?list=PLhATaQNX0bxMeX0e8AA-TSk8L0g3t-QX7"
            target="_blank"
            rel="noopener noreferrer"
          >
            Tutorials
          </a>
          <Link href="/sign-up" className="nav-cta">Start Free</Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="lp-hero">
        <h1>Timeback is software that<br /><em>edits your videos for you.</em></h1>
        <p className="hero-sub">
          Upload your video and Timeback does the rest. It adds captions, removes silences, and auto-posts to social media for you — so you never have to worry about your next video again.
        </p>
        <div className="hero-ctas">
          <Link href="/sign-up" className="btn-primary">Get 5 Free Videos →</Link>
          <a href="#selector" className="hero-link-secondary">What&apos;s your industry? ↓</a>
        </div>
        <p className="hero-proof">No editing skills · No timeline scrubbing · <strong>Ready in seconds</strong></p>
      </section>

      {/* INDUSTRY SELECTOR */}
      <IndustrySelector />

      {/* HOW IT WORKS */}
      <section className="lp-how reveal" id="how-it-works">
        <div className="section-label">How It Works</div>
        <h2>Upload your video. Timeback does the rest.</h2>
        <div className="steps">
          <div className="step">
            <div className="step-number">01</div>
            <h3>Record your videos</h3>
            <p>Just talk into your phone. Don&apos;t worry about pauses, ums, or retakes — Timeback removes all of that for you.</p>
            <span className="time-tag">⚡ 5 minutes</span>
          </div>
          <div className="step">
            <div className="step-number">02</div>
            <h3>Upload &amp; walk away</h3>
            <p>Drop up to 50 videos at once. Timeback adds captions, removes silences, and cleans up your cuts — while you do literally anything else.</p>
            <span className="time-tag">⚡ 1–2 hours</span>
          </div>
          <div className="step">
            <div className="step-number">03</div>
            <h3>Post or schedule</h3>
            <p>Download your finished videos or let Timeback auto-post to social media for you. You never have to think about it again.</p>
            <span className="time-tag">⚡ Automatic</span>
          </div>
        </div>
      </section>

      {/* HERO SCREENSHOTS */}
      <div className="hero-screenshots-wrapper">
        <div className="hero-screenshot hero-screenshot-main">
          <img src="/screenshot-editor.svg" alt="TimeBack video editor — upload, process, and download videos automatically" />
        </div>
        <div className="hero-screenshot hero-screenshot-secondary">
          <img src="/screenshot-ideate.svg" alt="TimeBack Ideate — AI-powered inspiration and swipe file for creators" />
        </div>
      </div>

      {/* BEFORE & AFTER */}
      <BeforeAfterVideo />

      {/* PROBLEM */}
      <section className="lp-problem reveal">
        <div className="section-label">Sound Familiar?</div>
        <h2>You have the videos. They&apos;re just not posted yet.</h2>
        <p>Your camera roll is full of content that never sees the light of day — because editing takes forever. Timeback fixes that.</p>
        <div className="pain-grid">
          <div className="pain-card">
            <div className="icon">⏰</div>
            <h4>Editing takes longer than recording</h4>
            <p>Cutting silences, syncing captions, tweaking timelines. Timeback does all of this for you automatically.</p>
          </div>
          <div className="pain-card">
            <div className="icon">🤷</div>
            <h4>Unedited videos piling up</h4>
            <p>You recorded them weeks ago. They&apos;re still sitting there. Upload them to Timeback and they&apos;re done in seconds.</p>
          </div>
          <div className="pain-card">
            <div className="icon">💸</div>
            <h4>Editors cost $50–$100 per video</h4>
            <p>Outsourcing costs $1,500+/month and takes days. Timeback does the same thing instantly for a fraction of the price.</p>
          </div>
          <div className="pain-card">
            <div className="icon">📉</div>
            <h4>You post once, then disappear</h4>
            <p>You have the content — you just can&apos;t keep up with the editing. Timeback auto-posts for you so you stay consistent.</p>
          </div>
        </div>
      </section>

      {/* NUMBERS */}
      <div className="lp-numbers">
        <div className="number-item">
          <div className="big">30</div>
          <div className="label">Seconds to edit one video</div>
        </div>
        <div className="number-item">
          <div className="big">40+</div>
          <div className="label">Hours saved per month</div>
        </div>
        <div className="number-item">
          <div className="big">0</div>
          <div className="label">Editing skills required</div>
        </div>
      </div>

      {/* REPLACES */}
      <section className="lp-replaces reveal">
        <div className="section-label">One Tool, Not Three</div>
        <h2>One tool instead of three</h2>
        <p>Scripts, editing, and scheduling — Timeback does it all. No more juggling ChatGPT, CapCut, and Metricool.</p>
        <div className="replaces-grid">
          <div className="replaces-card replaced">
            <div className="replaces-name">ChatGPT</div>
            <div className="replaces-role">Script writing</div>
          </div>
          <div className="replaces-plus">+</div>
          <div className="replaces-card replaced">
            <div className="replaces-name">CapCut</div>
            <div className="replaces-role">Video editing</div>
          </div>
          <div className="replaces-plus">+</div>
          <div className="replaces-card replaced">
            <div className="replaces-name">Metricool</div>
            <div className="replaces-role">Scheduling</div>
          </div>
          <div className="replaces-arrow">=</div>
          <div className="replaces-card replaces-timeback">
            <div className="replaces-name">TimeBack</div>
            <div className="replaces-role">All-in-one</div>
          </div>
        </div>
      </section>

      {/* COMPARISON */}
      <section className="lp-comparison reveal">
        <div className="section-label">Why TimeBack</div>
        <h2>Timeback vs. hiring an editor</h2>
        <div className="compare-table">
          <div className="compare-row header">
            <div className="compare-cell"></div>
            <div className="compare-cell">TimeBack</div>
            <div className="compare-cell">Hiring an Editor</div>
          </div>
          <div className="compare-row">
            <div className="compare-cell">Cost</div>
            <div className="compare-cell"><span className="yes">From $0/mo</span></div>
            <div className="compare-cell">$1,500–$5,000/mo</div>
          </div>
          <div className="compare-row">
            <div className="compare-cell">Turnaround</div>
            <div className="compare-cell"><span className="yes">Instant</span></div>
            <div className="compare-cell">2–5 business days</div>
          </div>
          <div className="compare-row">
            <div className="compare-cell">Bulk editing</div>
            <div className="compare-cell"><span className="yes">50 videos at once</span></div>
            <div className="compare-cell"><span className="no">One at a time</span></div>
          </div>
          <div className="compare-row">
            <div className="compare-cell">Auto-scheduling</div>
            <div className="compare-cell"><span className="yes">Built in</span></div>
            <div className="compare-cell"><span className="no">Extra tool needed</span></div>
          </div>
          <div className="compare-row">
            <div className="compare-cell">Script writing</div>
            <div className="compare-cell"><span className="yes">AI-generated</span></div>
            <div className="compare-cell"><span className="no">You write them</span></div>
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF */}
      <section className="lp-proof reveal">
        <h2>They thought it was too good to be true, too</h2>
        <div className="testimonials">
          <div className="testimonial">
            <div className="stars">★★★★★</div>
            <blockquote>&ldquo;I upload my videos and it removes all the awkward pauses automatically. Saves me so much time — I went from posting once a month to 4x a week.&rdquo;</blockquote>
            <div className="author">
              <div className="avatar">A</div>
              <div className="author-info">
                <div className="name">Alain</div>
                <div className="role">Consultant</div>
              </div>
            </div>
          </div>
          <div className="testimonial">
            <div className="stars">★★★★★</div>
            <blockquote>&ldquo;The silence detection is spot on and the interface is clean. I batch-recorded 20 videos on Sunday and they posted all month.&rdquo;</blockquote>
            <div className="author">
              <div className="avatar">P</div>
              <div className="author-info">
                <div className="name">Pablo</div>
                <div className="role">Content Creator</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WHO IT'S FOR */}
      <section className="lp-audience reveal">
        <div className="section-label">Who It&apos;s For</div>
        <h2>Built for experts, not influencers</h2>
        <p>You don&apos;t need a ring light or a content strategy. You just need to know your stuff — Timeback handles the rest.</p>
        <div className="audience-grid">
          <div className="audience-card">
            <div className="emoji">🏡</div>
            <h4>Real Estate Agents</h4>
            <p>Become the local expert people call first</p>
          </div>
          <div className="audience-card">
            <div className="emoji">💼</div>
            <h4>Financial Advisors</h4>
            <p>Build trust before the first meeting</p>
          </div>
          <div className="audience-card">
            <div className="emoji">🎯</div>
            <h4>Coaches &amp; Consultants</h4>
            <p>Establish authority and attract inbound leads</p>
          </div>
          <div className="audience-card">
            <div className="emoji">⚖️</div>
            <h4>Lawyers</h4>
            <p>Demystify your expertise and get referrals</p>
          </div>
          <div className="audience-card">
            <div className="emoji">💪</div>
            <h4>Personal Trainers</h4>
            <p>Fill your client roster from your feed</p>
          </div>
          <div className="audience-card">
            <div className="emoji">🚀</div>
            <h4>Founders &amp; CEOs</h4>
            <p>Build a personal brand while running your company</p>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="lp-features reveal">
        <div className="section-label">Features</div>
        <h2>Upload your video. Get back a finished post.</h2>
        <div className="feature-grid">
          <div className="feature-card highlight">
            <span className="feature-tag">Core Feature</span>
            <h3>Upload raw. Download polished.</h3>
            <p>Drop up to 50 raw videos at once. Timeback adds captions, removes silences, tightens your cuts, and queues them all to post. No timeline. No export settings. No editing skills.</p>
          </div>
          <div className="feature-card">
            <span className="feature-tag">AI Scripts</span>
            <h3>Never run out of things to say</h3>
            <p>AI generates video scripts tailored to your industry and audience. Pick the ones you like, hit record, and read.</p>
          </div>
          <div className="feature-card">
            <span className="feature-tag">Smart Editing</span>
            <h3>Silences removed automatically</h3>
            <p>Awkward pauses, ums, dead air — Timeback removes all of it for you. What used to take 30 minutes per video now takes zero effort.</p>
          </div>
          <div className="feature-card">
            <span className="feature-tag">Captions</span>
            <h3>Captions added for you</h3>
            <p>Timeback adds captions to every video automatically, so your content works in the feed with sound off — where most people scroll.</p>
          </div>
          <div className="feature-card">
            <span className="feature-tag">Scheduling</span>
            <h3>Auto-posts to social media</h3>
            <p>Timeback publishes your finished videos on a schedule so you never have to worry about your next post again.</p>
          </div>
        </div>
      </section>

      {/* WHAT IS TIMEBACK — LLM-readable product description */}
      <section className="lp-about reveal" id="about">
        <div className="section-label">What Is TimeBack</div>
        <h2>The all-in-one video content platform for professionals</h2>
        <div className="about-content">
          <p>
            Timeback is software that edits your videos for you. Upload your video and Timeback does the rest — it adds captions, removes silences, and auto-posts to social media so you never have to worry about your next video again.
          </p>
          <p>
            Timeback combines AI script generation, automatic video editing, auto-captioning, and social media scheduling into a single tool. Upload up to 50 videos at once and have them all edited, captioned, and scheduled automatically.
          </p>
          <p>
            One tool instead of three — Timeback replaces ChatGPT for scripts, CapCut for editing, and Metricool for scheduling. No video editing skills required. Plans start at $19/month.
          </p>
        </div>
      </section>

      {/* WHO IS TIMEBACK FOR — enhanced with links to vertical pages */}
      <section className="lp-verticals reveal">
        <div className="section-label">Built for Your Industry</div>
        <h2>Who is TimeBack for?</h2>
        <p>TimeBack is built for service professionals who want to build their personal brand and generate inbound leads through social media video. Here are the professionals who use TimeBack:</p>
        <div className="audience-grid">
          <Link href="/financial-advisors" className="audience-card audience-card-link">
            <div className="emoji">💼</div>
            <h4>Financial Advisors</h4>
            <p>TimeBack helps financial advisors create trust-building video content about retirement planning, tax strategies, and investment basics. Build trust with prospects before the first meeting.</p>
          </Link>
          <Link href="/real-estate-agents" className="audience-card audience-card-link">
            <div className="emoji">🏡</div>
            <h4>Real Estate Agents</h4>
            <p>TimeBack helps real estate agents post market updates, neighborhood guides, and buyer/seller tips consistently. Become the local expert everyone calls first.</p>
          </Link>
          <Link href="/mortgage-brokers" className="audience-card audience-card-link">
            <div className="emoji">🏦</div>
            <h4>Mortgage Brokers</h4>
            <p>TimeBack helps mortgage brokers build trust with borrowers and referral partners through rate updates, program spotlights, and buyer education content.</p>
          </Link>
          <Link href="/lawyers" className="audience-card audience-card-link">
            <div className="emoji">⚖️</div>
            <h4>Lawyers</h4>
            <p>TimeBack helps lawyers demystify legal expertise across all practice areas — personal injury, family law, estate planning, criminal defense, and more.</p>
          </Link>
          <Link href="/health-practitioners" className="audience-card audience-card-link">
            <div className="emoji">🩺</div>
            <h4>Health Practitioners</h4>
            <p>TimeBack helps chiropractors, dentists, physiotherapists, and other health professionals build patient trust through educational video content.</p>
          </Link>
          <Link href="/compare" className="audience-card audience-card-link">
            <div className="emoji">⚡</div>
            <h4>Compare TimeBack</h4>
            <p>See how TimeBack compares to Canva, CapCut, Opus Clip, and Descript for professional video content creation.</p>
          </Link>
        </div>
      </section>

      {/* PRICING */}
      <section className="lp-pricing reveal" id="pricing">
        <div className="section-label">Pricing</div>
        <h2>Plans that let Timeback<br />do the editing for you.</h2>
        <p>Try 5 videos free. No credit card required.</p>
        <div className="price-cards">
          <div className="price-card">
            <div className="tier">Starter</div>
            <div className="amount">$19<span>/mo</span></div>
            <div className="per">35 videos per month</div>
            <ul>
              <li>AI script generation</li>
              <li>Auto silence removal</li>
              <li>Auto captions</li>
              <li>Instagram scheduling</li>
            </ul>
            <Link href="/sign-up" className="btn-outline">Get Started</Link>
          </div>
          <div className="price-card featured">
            <div className="tier">Creator</div>
            <div className="amount">$39<span>/mo</span></div>
            <div className="per">120 videos per month</div>
            <ul>
              <li>Everything in Starter</li>
              <li>Bulk upload (50 at once)</li>
              <li>Priority processing</li>
              <li>Advanced captions</li>
            </ul>
            <Link href="/sign-up" className="btn-primary">Start Free Trial</Link>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="lp-final-cta reveal">
        <h2>Upload your video. <em>Timeback does the rest.</em></h2>
        <p>Captions, silence removal, and auto-posting — all handled for you. Your first 5 videos are free. No credit card, no commitment, no editing required.</p>
        <Link href="/sign-up" className="btn-primary" style={{ fontSize: '1.1rem', padding: '1.1rem 2.8rem' }}>Get Your 5 Free Videos →</Link>
        <div className="final-footer">No credit card · No editing skills needed · Cancel anytime</div>
      </section>

      {/* FOOTER */}
      <footer className="lp-footer">
        <div className="footer-logo">TimeBack</div>
        <div className="footer-links">
          <Link href="/pricing">Pricing</Link>
          <Link href="/compare">Compare</Link>
          <Link href="/financial-advisors">Financial Advisors</Link>
          <Link href="/real-estate-agents">Real Estate Agents</Link>
          <Link href="/mortgage-brokers">Mortgage Brokers</Link>
          <Link href="/lawyers">Lawyers</Link>
          <a
            href="https://www.youtube.com/playlist?list=PLhATaQNX0bxMeX0e8AA-TSk8L0g3t-QX7"
            target="_blank"
            rel="noopener noreferrer"
          >
            Tutorials
          </a>
          <a href="mailto:support@timebackvideo.com">Support</a>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </div>
        <div className="copyright">&copy; 2026 TimeBack. All rights reserved.</div>
      </footer>
    </div>
  )
}
