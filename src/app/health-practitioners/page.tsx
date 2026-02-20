import Link from 'next/link'
import type { Metadata } from 'next'
import s from './page.module.css'
import MobileMenuToggle from '@/components/MobileMenuToggle'

export const metadata: Metadata = {
  title: 'TimeBack for Health Practitioners — Become the Provider Patients Trust Before They Book',
  description:
    'TimeBack writes your scripts, edits your videos, and posts to Instagram on autopilot. Build patient trust through educational content — without spending hours on social media. Built for chiropractors, dentists, physios, and health practitioners.',
}

export default function HealthPractitionersPage() {
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
            <span className={s.dot}></span> Built for Health Practitioners
          </div>
          <h1>
            Patients pick the provider they{' '}
            <em>already trust.</em>
          </h1>
          <p>
            TimeBack writes your scripts, edits your videos, and posts to
            Instagram on autopilot. Build patient trust through educational
            content — without spending hours on social media.
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
          <h2>Your waiting room is half empty. Your competitors are all over Instagram.</h2>
          <p>
            The practitioners filling their schedules aren&apos;t necessarily
            better clinicians — they&apos;re the ones patients see and trust
            online before they ever book an appointment.
          </p>
          <div className={s.painGrid}>
            <div className={s.painCard}>
              <div className={s.icon}>👻</div>
              <h4>You&apos;re invisible to new patients</h4>
              <p>
                When someone searches &ldquo;best chiropractor near me&rdquo; or
                &ldquo;dentist that explains things&rdquo; — you&apos;re not
                showing up. The ones who post video are.
              </p>
            </div>
            <div className={s.painCard}>
              <div className={s.icon}>📋</div>
              <h4>Referrals are drying up</h4>
              <p>
                Word of mouth used to fill your schedule. Now patients Google
                before they trust a referral — and if they can&apos;t find you
                online, they book someone else.
              </p>
            </div>
            <div className={s.painCard}>
              <div className={s.icon}>⏰</div>
              <h4>Back-to-back patients leave zero time for content</h4>
              <p>
                Between appointments, charting, and running your practice —
                who has time to script, film, edit, and post? That&apos;s a
                second job.
              </p>
            </div>
            <div className={s.painCard}>
              <div className={s.icon}>🤷</div>
              <h4>You don&apos;t know what to say on camera</h4>
              <p>
                You&apos;re an expert in your field, but translating clinical
                knowledge into engaging 60-second videos feels impossible
                without a script.
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
          <h2>Fill your schedule with patients who already trust you</h2>
          <p className={s.solutionSubtext}>
            TimeBack handles scripts, editing, captions, and posting — so one
            recording session fills your Instagram for the entire month.
          </p>
          <div className={s.solGrid}>
            <div className={s.solCard}>
              <div className={s.solTag}>Patient Education</div>
              <h3>Scripts that build trust</h3>
              <p>
                AI generates topics like &ldquo;3 stretches for lower back
                pain&rdquo; or &ldquo;What happens during your first
                visit.&rdquo; Educational, approachable, and trust-building.
              </p>
            </div>
            <div className={s.solCard}>
              <div className={s.solTag}>Fast Editing</div>
              <h3>Polished in seconds</h3>
              <p>
                Film a quick explainer between patients, upload it, and TimeBack
                removes dead air, adds captions, and tightens pacing. No
                editing skills needed.
              </p>
            </div>
            <div className={s.solCard}>
              <div className={s.solTag}>Captions</div>
              <h3>Feed-friendly by default</h3>
              <p>
                Auto-captions on every video. Patients scroll on mute —
                your health tips still land.
              </p>
            </div>
            <div className={s.solCard}>
              <div className={s.solTag}>Batch Upload</div>
              <h3>50 videos at once</h3>
              <p>
                Record a batch of patient tips, myth busters, and treatment
                explainers. Upload all 50. TimeBack edits every one.
              </p>
            </div>
            <div className={s.solCard}>
              <div className={s.solTag}>Scheduling</div>
              <h3>Auto-post to Instagram</h3>
              <p>
                Consistent posting = top of mind. When someone in your area
                needs care, you&apos;re the first practitioner they think of.
              </p>
            </div>
            <div className={s.solCard}>
              <div className={s.solTag}>Authority</div>
              <h3>Become the go-to expert</h3>
              <p>
                Patients share your videos with friends. Doctors refer to the
                practitioner they see online. Your content does your marketing
                for you.
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
          <h2>What top health practitioners are recording this week</h2>
          <p className={s.scriptsSubtext}>
            TimeBack generates scripts tailored to health practitioners. Here&apos;s a sample:
          </p>
          <div className={s.scriptExamples}>
            <div className={s.scriptCard}>
              <div className={s.scriptCat}>Patient Education</div>
              <h4>
                &ldquo;Why your back pain keeps coming back (and what to do about it)&rdquo;
              </h4>
              <p>
                Educational content that answers the questions patients are
                already Googling. Positions you as the expert with the answer.
              </p>
            </div>
            <div className={s.scriptCard}>
              <div className={s.scriptCat}>Myth Busting</div>
              <h4>
                &ldquo;No, cracking your knuckles doesn&apos;t cause arthritis&rdquo;
              </h4>
              <p>
                Debunk common health myths and earn trust by showing patients
                you care about the truth, not just bookings.
              </p>
            </div>
            <div className={s.scriptCard}>
              <div className={s.scriptCat}>First Visit</div>
              <h4>
                &ldquo;What to expect at your first appointment&rdquo;
              </h4>
              <p>
                Reduce new-patient anxiety and increase show rates. People
                book providers they feel they already know.
              </p>
            </div>
            <div className={s.scriptCard}>
              <div className={s.scriptCat}>Quick Tips</div>
              <h4>
                &ldquo;Do this one stretch before bed tonight&rdquo;
              </h4>
              <p>
                Quick, actionable tips get saved and shared. Patients tag
                friends, growing your reach organically.
              </p>
            </div>
            <div className={s.scriptCard}>
              <div className={s.scriptCat}>Behind the Scenes</div>
              <h4>
                &ldquo;A day in the life of a [practitioner type]&rdquo;
              </h4>
              <p>
                Personality-driven content that makes patients feel like they
                know you. Familiarity builds trust.
              </p>
            </div>
            <div className={s.scriptCard}>
              <div className={s.scriptCat}>Seasonal</div>
              <h4>
                &ldquo;3 things to do this winter to avoid getting sick&rdquo;
              </h4>
              <p>
                Timely, relevant content that shows you&apos;re on top of your
                field and thinking about your patients.
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
                Tell TimeBack your specialty and patient base. AI generates a
                batch of educational scripts you can customize or use as-is.
              </p>
              <span className={s.timeTag}>⚡ 5 minutes</span>
            </div>
            <div className={s.step}>
              <div className={s.stepNum}>02</div>
              <h3>Batch record &amp; upload</h3>
              <p>
                Film quick explainers, myth busters, and patient tips back to
                back. Upload up to 50 at once. Just talk — AI handles the rest.
              </p>
              <span className={s.timeTag}>⚡ 1–2 hours</span>
            </div>
            <div className={s.step}>
              <div className={s.stepNum}>03</div>
              <h3>Auto-edit &amp; auto-post</h3>
              <p>
                TimeBack removes silences, adds captions, tightens pacing, and
                auto-schedules everything to Instagram. Done.
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
              &ldquo;I started posting patient education videos 3x a week using
              TimeBack. Within two months I had 12 new patients who said they
              found me on Instagram. That&apos;s thousands in revenue from a
              $39/month tool.&rdquo;
            </blockquote>
            <div className={s.author}>
              <div className={s.avatar}>S</div>
              <div>
                <div className={s.authorName}>Sarah M.</div>
                <div className={s.authorRole}>Chiropractor</div>
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
              Your next patient is scrolling right now.{' '}
              <em>Will they find you?</em>
            </h2>
            <p>
              One afternoon. 30 days of content. Become the practitioner
              patients trust before they book.
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
