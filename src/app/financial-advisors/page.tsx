import Link from 'next/link'
import type { Metadata } from 'next'
import s from './page.module.css'

export const metadata: Metadata = {
  title: 'TimeBack for Financial Advisors — Build Trust Before the First Meeting',
  description:
    'TimeBack turns one afternoon of recording into a month of trust-building video content — scripted, edited, captioned, and posted to Instagram. Built for financial advisors.',
}

export default function FinancialAdvisorsPage() {
  return (
    <div className={s.page}>
      {/* NAV */}
      <nav className={s.nav}>
        <Link href="/" className={s.logo}>TimeBack</Link>
        <div className={s.navRight}>
          <a href="#how">How It Works</a>
          <a href="#pricing">Pricing</a>
          <Link href="/sign-up" className={s.btn}>Start Free</Link>
        </div>
      </nav>

      {/* HERO */}
      <section className={s.hero}>
        <div className={s.heroInner}>
          <div className={s.heroBadge}>
            <span className={s.dot}></span> Built for Financial Advisors
          </div>
          <h1>
            Your prospects Google you before they call you.{' '}
            <em>What do they find?</em>
          </h1>
          <p>
            TimeBack turns one afternoon of recording into a month of trust-building
            video content — scripted, edited, captioned, and posted to Instagram. No
            editing skills. No content team. No compliance headaches.
          </p>
          <div className={s.heroCtas}>
            <Link href="/sign-up" className={s.btn}>Start Creating Free →</Link>
            <a href="#how" className={s.btnOutline}>See How It Works</a>
          </div>
          <p className={s.heroProof}>
            No credit card required · <strong>5 free videos</strong> to start · Cancel anytime
          </p>
        </div>
      </section>

      {/* PAIN POINTS */}
      <section className={s.pain}>
        <div className={s.container}>
          <div className={s.sectionLabel}>The Problem</div>
          <h2>You know video builds trust. But who has the time?</h2>
          <p>
            Between client meetings, portfolio reviews, and compliance — content
            creation keeps falling to the bottom of the list.
          </p>
          <div className={s.painGrid}>
            <div className={s.painCard}>
              <div className={s.icon}>📊</div>
              <h4>Clients expect to see you online</h4>
              <p>
                73% of prospects research advisors on social before ever reaching out.
                If you&apos;re invisible, you&apos;re losing AUM to the advisor who isn&apos;t.
              </p>
            </div>
            <div className={s.painCard}>
              <div className={s.icon}>⏰</div>
              <h4>Zero time between clients</h4>
              <p>
                You&apos;re in meetings all day, doing plan reviews at night. Learning
                video editing isn&apos;t happening — and hiring a $3K/month agency
                doesn&apos;t make sense yet.
              </p>
            </div>
            <div className={s.painCard}>
              <div className={s.icon}>🤷</div>
              <h4>&ldquo;What would I even talk about?&rdquo;</h4>
              <p>
                You&apos;ve got deep expertise but staring at a camera with no script
                is paralyzing. The ideas are there — you just need a system to get
                them out.
              </p>
            </div>
            <div className={s.painCard}>
              <div className={s.icon}>📉</div>
              <h4>Inconsistency kills growth</h4>
              <p>
                You posted three times in January, nothing in February. The algorithm
                forgot you exist. Your audience did too.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SOLUTION */}
      <section className={s.solution}>
        <div className={s.container}>
          <div className={s.sectionLabel} style={{ color: 'var(--orange)' }}>
            The Solution
          </div>
          <h2>One Sunday afternoon = 30 days of content</h2>
          <p className={s.solutionSubtext}>
            TimeBack handles everything between &ldquo;record&rdquo; and
            &ldquo;posted&rdquo; — so you can focus on what you actually got licensed
            to do.
          </p>
          <div className={s.solGrid}>
            <div className={s.solCard}>
              <div className={s.solTag}>Scripts</div>
              <h3>AI writes your scripts</h3>
              <p>
                Tell TimeBack you&apos;re a financial advisor. Get scripts like &ldquo;3
                things to do before year-end&rdquo; or &ldquo;Why your 401k match is
                free money.&rdquo; Customize or use as-is.
              </p>
            </div>
            <div className={s.solCard}>
              <div className={s.solTag}>Editing</div>
              <h3>Auto-removes silences &amp; ums</h3>
              <p>
                Just talk to your phone. TimeBack cuts the awkward pauses, tightens
                your delivery, and makes you sound polished — without touching an
                editor.
              </p>
            </div>
            <div className={s.solCard}>
              <div className={s.solTag}>Captions</div>
              <h3>Captions on every video</h3>
              <p>
                Auto-generated captions so your content works in the feed with sound
                off — where 85% of scrolling happens.
              </p>
            </div>
            <div className={s.solCard}>
              <div className={s.solTag}>Bulk Upload</div>
              <h3>Upload 50 videos at once</h3>
              <p>
                Batch-record on Sunday. Upload all 50. TimeBack edits and polishes
                every single one in parallel.
              </p>
            </div>
            <div className={s.solCard}>
              <div className={s.solTag}>Scheduling</div>
              <h3>Auto-post to Instagram</h3>
              <p>
                Set it and forget it. Your videos publish on a consistent schedule so
                you stay top of mind with prospects and COIs.
              </p>
            </div>
            <div className={s.solCard}>
              <div className={s.solTag}>All-in-One</div>
              <h3>Replaces 3 tools</h3>
              <p>
                No more juggling ChatGPT for scripts, CapCut for editing, and Metricool
                for scheduling. One tool. One login. Done.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SCRIPTS */}
      <section className={s.scripts}>
        <div className={s.container}>
          <div className={s.sectionLabel} style={{ textAlign: 'center' }}>
            Script Ideas
          </div>
          <h2>Never stare at the camera wondering what to say</h2>
          <p className={s.scriptsSubtext}>
            TimeBack generates scripts tailored to your niche. Here&apos;s what
            advisors are recording this week:
          </p>
          <div className={s.scriptExamples}>
            <div className={s.scriptCard}>
              <div className={s.scriptCat}>Trust Building</div>
              <h4>
                &ldquo;5 questions to ask any financial advisor before hiring
                them&rdquo;
              </h4>
              <p>
                Position yourself as the transparent choice by giving prospects a
                checklist — that you already pass.
              </p>
            </div>
            <div className={s.scriptCard}>
              <div className={s.scriptCat}>Educational</div>
              <h4>
                &ldquo;Roth IRA vs. Traditional — explained in 60 seconds&rdquo;
              </h4>
              <p>
                Simple breakdowns of complex topics make you the go-to expert in your
                prospect&apos;s feed.
              </p>
            </div>
            <div className={s.scriptCard}>
              <div className={s.scriptCat}>Myth Busting</div>
              <h4>
                &ldquo;No, you don&apos;t need $500K to work with a financial
                advisor&rdquo;
              </h4>
              <p>
                Break down barriers to entry and attract the next generation of
                clients.
              </p>
            </div>
            <div className={s.scriptCard}>
              <div className={s.scriptCat}>Seasonal</div>
              <h4>
                &ldquo;3 tax moves to make before December 31st&rdquo;
              </h4>
              <p>
                Time-sensitive content that drives urgency and positions you as
                proactive, not reactive.
              </p>
            </div>
            <div className={s.scriptCard}>
              <div className={s.scriptCat}>Personal Brand</div>
              <h4>
                &ldquo;Why I became a financial advisor (and who I help)&rdquo;
              </h4>
              <p>
                People buy from people. Let them see who you are beyond the
                credentials.
              </p>
            </div>
            <div className={s.scriptCard}>
              <div className={s.scriptCat}>Social Proof</div>
              <h4>
                &ldquo;What my clients wish they knew 10 years ago&rdquo;
              </h4>
              <p>
                Share anonymized wisdom that shows you&apos;ve helped people just like
                your prospect.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className={s.how} id="how">
        <div className={s.container}>
          <div className={s.sectionLabel}>How It Works</div>
          <h2>From zero to a full feed in 3 steps</h2>
          <div className={s.steps}>
            <div className={s.step}>
              <div className={s.stepNum}>01</div>
              <h3>Pick your topics</h3>
              <p>
                Tell TimeBack you&apos;re a financial advisor. AI generates a batch of
                scroll-stopping scripts tailored to your audience and niche.
              </p>
              <span className={s.timeTag}>⚡ 5 minutes</span>
            </div>
            <div className={s.step}>
              <div className={s.stepNum}>02</div>
              <h3>Batch record &amp; upload</h3>
              <p>
                Film your videos back to back — no teleprompter needed. Upload up to
                50 at once. Just talk and AI handles the rest.
              </p>
              <span className={s.timeTag}>⚡ 1–2 hours</span>
            </div>
            <div className={s.step}>
              <div className={s.stepNum}>03</div>
              <h3>Auto-edit &amp; auto-post</h3>
              <p>
                TimeBack removes silences, adds captions, polishes your cuts, and
                auto-schedules everything to Instagram. You&apos;re done.
              </p>
              <span className={s.timeTag}>⚡ Automatic</span>
            </div>
          </div>
        </div>
      </section>

      {/* COMPARISON */}
      <section className={s.compare} id="pricing">
        <div className={s.container}>
          <div className={s.sectionLabel}>Why TimeBack</div>
          <h2>The math is simple</h2>
          <div className={s.compareTable}>
            <div className={`${s.compareRow} ${s.compareRowHeader}`}>
              <div className={s.compareCell}></div>
              <div className={s.compareCell}>TimeBack</div>
              <div className={s.compareCell}>Hiring an Editor</div>
            </div>
            <div className={s.compareRow}>
              <div className={s.compareCell}>Cost</div>
              <div className={s.compareCell}>
                <span className={s.yes}>From $19/mo</span>
              </div>
              <div className={s.compareCell}>$1,500–$5,000/mo</div>
            </div>
            <div className={s.compareRow}>
              <div className={s.compareCell}>Turnaround</div>
              <div className={s.compareCell}>
                <span className={s.yes}>Instant</span>
              </div>
              <div className={s.compareCell}>2–5 business days</div>
            </div>
            <div className={s.compareRow}>
              <div className={s.compareCell}>Bulk editing</div>
              <div className={s.compareCell}>
                <span className={s.yes}>50 videos at once</span>
              </div>
              <div className={s.compareCell}>
                <span className={s.no}>One at a time</span>
              </div>
            </div>
            <div className={s.compareRow}>
              <div className={s.compareCell}>Auto-scheduling</div>
              <div className={s.compareCell}>
                <span className={s.yes}>Built in</span>
              </div>
              <div className={s.compareCell}>
                <span className={s.no}>Extra tool needed</span>
              </div>
            </div>
            <div className={s.compareRow}>
              <div className={s.compareCell}>Script writing</div>
              <div className={s.compareCell}>
                <span className={s.yes}>AI-generated for finance</span>
              </div>
              <div className={s.compareCell}>
                <span className={s.no}>You write them</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIAL */}
      <section className={s.testimonialSection}>
        <div className={s.container}>
          <div className={s.testimonialCard}>
            <div className={s.stars}>★★★★★</div>
            <blockquote>
              &ldquo;I batch-recorded 25 videos on a Sunday and TimeBack had them
              edited and scheduled for the entire month. I&apos;ve gotten 3 new client
              inquiries just from people seeing my Reels. This is the easiest ROI in
              my practice.&rdquo;
            </blockquote>
            <div className={s.author}>
              <div className={s.avatar}>M</div>
              <div>
                <div className={s.authorName}>Michael R.</div>
                <div className={s.authorRole}>CFP®, Independent RIA</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className={s.finalCta}>
        <div className={s.container}>
          <div className={s.ctaBox}>
            <h2>
              Your prospects are scrolling right now.{' '}
              <em>Are you there?</em>
            </h2>
            <p>
              One afternoon. 30 days of trust-building content. No editing skills
              needed.
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
          <div className={s.logo}>TimeBack</div>
          <p>© 2026 TimeBack. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
