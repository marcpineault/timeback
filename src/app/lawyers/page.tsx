import Link from 'next/link'
import type { Metadata } from 'next'
import s from './page.module.css'

export const metadata: Metadata = {
  title: 'TimeBack for Lawyers — The Clients You Want Are Googling Right Now',
  description:
    'TimeBack writes your scripts, edits your videos, and posts to Instagram on autopilot. Demystify your expertise and attract clients who already feel like they know you.',
}

export default function LawyersPage() {
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
            <span className={s.dot}></span> Built for Lawyers
          </div>
          <h1>
            People hire lawyers they trust.{' '}
            <em>Let them see you first.</em>
          </h1>
          <p>
            TimeBack writes your scripts, edits your videos, and posts to
            Instagram on autopilot. Demystify your expertise and attract clients
            who already feel like they know you.
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
          <h2>You&apos;re a great attorney. But nobody knows that yet.</h2>
          <p>
            Most people don&apos;t know a lawyer until they desperately need one.
            The attorneys building their brand on social are the ones who get the
            call — not the ones on page 3 of Avvo.
          </p>
          <div className={s.painGrid}>
            <div className={s.painCard}>
              <div className={s.icon}>🔍</div>
              <h4>Legal directories aren&apos;t enough</h4>
              <p>
                You&apos;re listed on Avvo, Justia, and FindLaw — along with
                10,000 other attorneys. People don&apos;t choose from a list.
                They choose who they trust.
              </p>
            </div>
            <div className={s.painCard}>
              <div className={s.icon}>🤷</div>
              <h4>Clients don&apos;t understand what you do</h4>
              <p>
                The law is complex. Potential clients don&apos;t know when they
                need you, what you handle, or why you&apos;re different. Video
                makes it clear in 60 seconds.
              </p>
            </div>
            <div className={s.painCard}>
              <div className={s.icon}>💰</div>
              <h4>PPC costs are through the roof</h4>
              <p>
                &ldquo;Personal injury lawyer&rdquo; costs $100+ per click.
                Video content builds an organic pipeline of people who already
                trust you — at a fraction of the cost.
              </p>
            </div>
            <div className={s.painCard}>
              <div className={s.icon}>⏰</div>
              <h4>Billable hours come first</h4>
              <p>
                Between depositions, client calls, and court prep — content
                creation isn&apos;t even on the radar. You need something that
                takes minutes, not hours.
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
          <h2>Be the lawyer people already feel like they know</h2>
          <p className={s.solutionSubtext}>
            TimeBack handles scripts, editing, captions, and posting — so your
            expertise reaches people before they ever pick up the phone.
          </p>
          <div className={s.solGrid}>
            <div className={s.solCard}>
              <div className={s.solTag}>Scripts</div>
              <h3>Legal scripts that connect</h3>
              <p>
                AI generates topics for your practice area: &ldquo;What to do
                after a car accident&rdquo; or &ldquo;3 things landlords
                can&apos;t legally do.&rdquo; Authoritative but approachable.
              </p>
            </div>
            <div className={s.solCard}>
              <div className={s.solTag}>Editing</div>
              <h3>Sound polished, not stiff</h3>
              <p>
                TimeBack removes ums, long pauses, and dead air. You come across
                as confident and relatable — not robotic or rehearsed.
              </p>
            </div>
            <div className={s.solCard}>
              <div className={s.solTag}>Captions</div>
              <h3>Reach scrollers on mute</h3>
              <p>
                Auto-captions on every video. People watch legal content in
                silence — during lunch, on the bus, in waiting rooms. Your
                message still lands.
              </p>
            </div>
            <div className={s.solCard}>
              <div className={s.solTag}>Batch Upload</div>
              <h3>Record once, post all month</h3>
              <p>
                Block 90 minutes on a Saturday. Record 25 videos. Upload them
                all. TimeBack edits and schedules every one automatically.
              </p>
            </div>
            <div className={s.solCard}>
              <div className={s.solTag}>Scheduling</div>
              <h3>Stay consistent effortlessly</h3>
              <p>
                Auto-post to Instagram. Consistency builds familiarity.
                Familiarity builds trust. Trust gets you hired.
              </p>
            </div>
            <div className={s.solCard}>
              <div className={s.solTag}>Referrals</div>
              <h3>Get shared, get referred</h3>
              <p>
                When someone asks &ldquo;I need a lawyer&rdquo; in a Facebook
                group, your friend tags you because they saw your video last
                week. That&apos;s the power of showing up.
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
          <h2>What lawyers are recording this week</h2>
          <p className={s.scriptsSubtext}>
            TimeBack generates scripts by practice area. Here&apos;s a sample:
          </p>
          <div className={s.scriptExamples}>
            <div className={s.scriptCard}>
              <div className={s.scriptCat}>Personal Injury</div>
              <h4>
                &ldquo;The insurance company just called you. Here&apos;s what
                NOT to say.&rdquo;
              </h4>
              <p>
                Urgent, actionable advice that gets saved and shared. Positions
                you as the protector, not the ambulance chaser.
              </p>
            </div>
            <div className={s.scriptCard}>
              <div className={s.scriptCat}>Family Law</div>
              <h4>
                &ldquo;Filing for divorce? Here are the 5 things to do this
                week.&rdquo;
              </h4>
              <p>
                People in crisis search for answers. Be the calm, knowledgeable
                voice they find.
              </p>
            </div>
            <div className={s.scriptCard}>
              <div className={s.scriptCat}>Estate Planning</div>
              <h4>
                &ldquo;You need a will. Here&apos;s why your online one probably
                won&apos;t hold up.&rdquo;
              </h4>
              <p>
                Challenge DIY legal docs and drive consultations from people who
                realize they need professional help.
              </p>
            </div>
            <div className={s.scriptCard}>
              <div className={s.scriptCat}>Criminal Defense</div>
              <h4>
                &ldquo;Pulled over? Know your rights in 60 seconds.&rdquo;
              </h4>
              <p>
                Viral-format content that educates and builds massive trust with
                a broad audience.
              </p>
            </div>
            <div className={s.scriptCard}>
              <div className={s.scriptCat}>Business Law</div>
              <h4>
                &ldquo;LLC vs. S-Corp: which one actually saves you
                money?&rdquo;
              </h4>
              <p>
                Entrepreneurs eat this content up. Position yourself as the
                go-to attorney for small businesses.
              </p>
            </div>
            <div className={s.scriptCard}>
              <div className={s.scriptCat}>Immigration</div>
              <h4>
                &ldquo;3 myths about green cards that could cost you your
                case&rdquo;
              </h4>
              <p>
                Cut through misinformation with authority. Immigration content
                is under-served and highly shareable.
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
                Tell TimeBack your practice area. AI generates scripts tailored
                to your audience — personal injury, family law, estate planning,
                you name it.
              </p>
              <span className={s.timeTag}>⚡ 5 minutes</span>
            </div>
            <div className={s.step}>
              <div className={s.stepNum}>02</div>
              <h3>Batch record &amp; upload</h3>
              <p>
                Film quick talking heads back to back. No teleprompter needed.
                Upload up to 50 at once. Just speak naturally.
              </p>
              <span className={s.timeTag}>⚡ 1–2 hours</span>
            </div>
            <div className={s.step}>
              <div className={s.stepNum}>03</div>
              <h3>Auto-edit &amp; auto-post</h3>
              <p>
                TimeBack removes silences, adds captions, and auto-schedules to
                Instagram. New clients find you while you&apos;re in court.
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
              &ldquo;I was spending $8K/month on Google Ads. After 90 days of
              posting educational videos with TimeBack, I&apos;m getting more
              consultations from Instagram than from paid ads — and they&apos;re
              better clients because they already trust me.&rdquo;
            </blockquote>
            <div className={s.author}>
              <div className={s.avatar}>R</div>
              <div>
                <div className={s.authorName}>Rachel S.</div>
                <div className={s.authorRole}>Family Law Attorney</div>
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
              Someone in your city needs a lawyer right now.{' '}
              <em>Will they find you?</em>
            </h2>
            <p>
              One afternoon. 30 days of content. Build the practice you deserve.
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
