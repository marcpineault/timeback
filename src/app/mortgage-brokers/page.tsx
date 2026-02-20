import Link from 'next/link'
import type { Metadata } from 'next'
import s from './page.module.css'
import MobileMenuToggle from '@/components/MobileMenuToggle'

export const metadata: Metadata = {
  title: 'TimeBack for Mortgage Brokers — Win the Client Before the Rate Sheet',
  description:
    'TimeBack writes your scripts, edits your videos, and posts to Instagram on autopilot. Build trust with borrowers and referral partners — without becoming a content creator.',
}

export default function MortgageBrokersPage() {
  return (
    <div className={s.page}>
      {/* NAV */}
      <nav className={s.nav}>
        <Link href="/" className={s.logo}>TimeBack</Link>
        <MobileMenuToggle />
        <div className={s.navRight}>
          <a href="#how">How It Works</a>
          <a href="/pricing">Pricing</a>
          <Link href="/sign-up" className={s.btn}>Start Free</Link>
        </div>
      </nav>

      {/* HERO */}
      <section className={s.hero}>
        <div className={s.heroInner}>
          <div className={s.heroBadge}>
            <span className={s.dot}></span> Built for Mortgage Brokers
          </div>
          <h1>
            Win the client before they ever{' '}
            <em>compare rates.</em>
          </h1>
          <p>
            TimeBack writes your scripts, edits your videos, and posts to
            Instagram on autopilot. Build trust with borrowers and referral
            partners — without becoming a content creator.
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
          <h2>Rates change daily. But trust takes months to build.</h2>
          <p>
            When every broker has access to similar products, the one who wins is
            the one the borrower already knows, likes, and trusts. That starts on
            social media.
          </p>
          <div className={s.painGrid}>
            <div className={s.painCard}>
              <div className={s.icon}>📉</div>
              <h4>Rates aren&apos;t your differentiator</h4>
              <p>
                Competing on rate is a losing game — someone will always shave
                5bps. The brokers growing fastest are competing on trust and
                education.
              </p>
            </div>
            <div className={s.painCard}>
              <div className={s.icon}>🤝</div>
              <h4>Referral partners forget you exist</h4>
              <p>
                Realtors refer the LO they see the most. If you&apos;re not showing
                up in their feed consistently, you&apos;re getting replaced by someone
                who is.
              </p>
            </div>
            <div className={s.painCard}>
              <div className={s.icon}>😤</div>
              <h4>Borrowers ghost after the pre-qual</h4>
              <p>
                They&apos;re rate shopping 3 other LOs. The one who educated them on
                the process and built trust through content? That&apos;s who they
                close with.
              </p>
            </div>
            <div className={s.painCard}>
              <div className={s.icon}>⏰</div>
              <h4>Zero time between files</h4>
              <p>
                Between applications, processor calls, and underwriting
                conditions — you barely have time to eat lunch, let alone create
                content.
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
          <h2>Be the LO borrowers and agents already trust</h2>
          <p className={s.solutionSubtext}>
            TimeBack handles scripts, editing, captions, and posting — so one
            recording session builds your brand and your referral pipeline for the
            entire month.
          </p>
          <div className={s.solGrid}>
            <div className={s.solCard}>
              <div className={s.solTag}>Scripts</div>
              <h3>Mortgage-specific scripts</h3>
              <p>
                AI generates topics like &ldquo;FHA vs. Conventional — which is
                right for you?&rdquo; or &ldquo;3 things that kill your loan
                approval.&rdquo; Tailored to your borrower audience.
              </p>
            </div>
            <div className={s.solCard}>
              <div className={s.solTag}>Editing</div>
              <h3>Sound confident instantly</h3>
              <p>
                Silences, ums, and dead air — gone. TimeBack makes you sound
                polished and professional without any editing knowledge.
              </p>
            </div>
            <div className={s.solCard}>
              <div className={s.solTag}>Captions</div>
              <h3>Captions that convert</h3>
              <p>
                Auto-captions on every video. Borrowers scrolling on mute still
                get your message. Realtors sharing your clips get the full
                context.
              </p>
            </div>
            <div className={s.solCard}>
              <div className={s.solTag}>Batch Upload</div>
              <h3>50 videos, one session</h3>
              <p>
                Sunday morning. 90 minutes. 30+ videos recorded, uploaded, and
                processed. TimeBack edits every one while you go watch the game.
              </p>
            </div>
            <div className={s.solCard}>
              <div className={s.solTag}>Scheduling</div>
              <h3>Auto-post consistently</h3>
              <p>
                Consistency is the game. Auto-schedule to Instagram so borrowers
                AND realtors see you in their feed every single day.
              </p>
            </div>
            <div className={s.solCard}>
              <div className={s.solTag}>Referrals</div>
              <h3>Realtors share your content</h3>
              <p>
                When you post &ldquo;5 things buyers need to know before making an
                offer,&rdquo; realtors share it with their clients. That&apos;s a warm
                intro you didn&apos;t ask for.
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
          <h2>What top mortgage brokers are posting this week</h2>
          <p className={s.scriptsSubtext}>
            TimeBack generates scripts tailored to the mortgage industry. Just
            pick, record, and go.
          </p>
          <div className={s.scriptExamples}>
            <div className={s.scriptCard}>
              <div className={s.scriptCat}>Education</div>
              <h4>
                &ldquo;What&apos;s actually in your monthly mortgage payment?
                (It&apos;s not just the loan)&rdquo;
              </h4>
              <p>
                Break down PITI in 60 seconds. Simple explanations build trust
                with first-time buyers.
              </p>
            </div>
            <div className={s.scriptCard}>
              <div className={s.scriptCat}>Rate Talk</div>
              <h4>
                &ldquo;Rates dropped this week — here&apos;s what that means for
                you&rdquo;
              </h4>
              <p>
                Weekly rate updates position you as the market expert. Timely
                content gets shared fast.
              </p>
            </div>
            <div className={s.scriptCard}>
              <div className={s.scriptCat}>Myth Busting</div>
              <h4>
                &ldquo;You don&apos;t need 20% down to buy a house&rdquo;
              </h4>
              <p>
                Destroy the most common barrier to homeownership and generate
                buyer leads in the process.
              </p>
            </div>
            <div className={s.scriptCard}>
              <div className={s.scriptCat}>Process Tips</div>
              <h4>
                &ldquo;3 things that will tank your mortgage approval&rdquo;
              </h4>
              <p>
                Practical advice that borrowers screenshot and share. High value,
                high save rate.
              </p>
            </div>
            <div className={s.scriptCard}>
              <div className={s.scriptCat}>Agent Facing</div>
              <h4>
                &ldquo;Why your clients keep losing offers (and how to fix
                it)&rdquo;
              </h4>
              <p>
                Content that positions you as a partner to realtors, not just a
                vendor. Tag them. Build the relationship.
              </p>
            </div>
            <div className={s.scriptCard}>
              <div className={s.scriptCat}>Program Spotlight</div>
              <h4>
                &ldquo;This first-time buyer program gives you $10K toward your
                down payment&rdquo;
              </h4>
              <p>
                Spotlight specific loan programs. DPA content is the most-saved
                content in mortgage social.
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
                Tell TimeBack you&apos;re a mortgage broker. AI generates scripts on
                rates, programs, buyer tips, and agent-facing content.
              </p>
              <span className={s.timeTag}>⚡ 5 minutes</span>
            </div>
            <div className={s.step}>
              <div className={s.stepNum}>02</div>
              <h3>Batch record &amp; upload</h3>
              <p>
                Film your videos back to back — 60-second talking heads are all
                you need. Upload up to 50 at once.
              </p>
              <span className={s.timeTag}>⚡ 1–2 hours</span>
            </div>
            <div className={s.step}>
              <div className={s.stepNum}>03</div>
              <h3>Auto-edit &amp; auto-post</h3>
              <p>
                TimeBack removes silences, adds captions, and auto-schedules to
                Instagram. Your pipeline builds while you&apos;re closing files.
              </p>
              <span className={s.timeTag}>⚡ Automatic</span>
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
              &ldquo;Two realtors I&apos;d been trying to connect with for months
              reached out after seeing my rate update videos. They said &lsquo;you
              clearly know your stuff.&rsquo; That&apos;s 8 referrals in 60 days —
              from a tool that costs less than one Zillow lead.&rdquo;
            </blockquote>
            <div className={s.author}>
              <div className={s.avatar}>J</div>
              <div>
                <div className={s.authorName}>Jason P.</div>
                <div className={s.authorRole}>Mortgage Broker, NMLS #284719</div>
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
              Your next referral partner is scrolling right now.{' '}
              <em>What will they see?</em>
            </h2>
            <p>
              One afternoon. 30 days of content. Build trust at scale.
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
