import Link from 'next/link'
import type { Metadata } from 'next'
import s from './page.module.css'

export const metadata: Metadata = {
  title: 'TimeBack for Side Hustlers — Build Your Brand Before You Quit Your 9-to-5',
  description:
    "You've got the idea and the expertise — you just don't have the time. TimeBack turns your Sunday afternoon into a month of content — scripted, edited, captioned, and posted on autopilot.",
}

export default function SideHustlersPage() {
  return (
    <div className={s.page}>
      {/* NAV */}
      <nav className={s.nav}>
        <Link href="/" className={s.logo}>TimeBack</Link>
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
            <span className={s.dot}></span> Built for Side Hustlers
          </div>
          <h1>
            Build your audience{' '}
            <em>before you quit your job.</em>
          </h1>
          <p>
            You&apos;ve got the idea. You&apos;ve got the expertise. You just don&apos;t have the
            time. TimeBack turns your Sunday afternoon into a month of content —
            scripted, edited, captioned, and posted on autopilot.
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
          <h2>You want to build something of your own. But Monday always comes too fast.</h2>
          <p>
            You&apos;ve got a skill, an idea, a service people would pay for. But between
            your 9-to-5, commute, and life — content creation keeps getting pushed to
            &quot;next weekend.&quot;
          </p>
          <div className={s.painGrid}>
            <div className={s.painCard}>
              <div className={s.icon}>⏰</div>
              <h4>You have 2 hours a week. Maybe.</h4>
              <p>
                After work, dinner, and basic survival — there&apos;s barely enough time to
                think about your side hustle, let alone build a content machine around it.
              </p>
            </div>
            <div className={s.painCard}>
              <div className={s.icon}>🐣</div>
              <h4>Starting from zero is overwhelming</h4>
              <p>
                No audience. No followers. No idea what to post. The gap between &quot;I want
                to do this&quot; and actually doing it feels massive.
              </p>
            </div>
            <div className={s.painCard}>
              <div className={s.icon}>🎬</div>
              <h4>Editing is the bottleneck</h4>
              <p>
                You&apos;ve recorded videos before. They&apos;re sitting in your camera roll
                right now. Unedited. Because who has time to learn CapCut after a 10-hour
                workday?
              </p>
            </div>
            <div className={s.painCard}>
              <div className={s.icon}>😤</div>
              <h4>Inconsistency kills momentum</h4>
              <p>
                You post for a week, get busy at work, disappear for a month. The algorithm
                forgets you. Your audience forgets you. You feel like starting over every time.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SOLUTION */}
      <section className={s.solution}>
        <div className={s.container}>
          <div className={s.sectionLabel}>The Solution</div>
          <h2>One afternoon a month. That&apos;s all it takes.</h2>
          <p className={s.solutionSubtext}>
            TimeBack handles scripts, editing, captions, and scheduling — so you can
            build an audience on nights and weekends without burning out.
          </p>
          <div className={s.solGrid}>
            <div className={s.solCard}>
              <div className={s.solTag}>Scripts</div>
              <h3>AI writes your content ideas</h3>
              <p>
                Tell TimeBack what you do and who you help. Get 30+ script ideas you can
                customize or read as-is. No more &quot;what should I post?&quot; paralysis.
              </p>
            </div>
            <div className={s.solCard}>
              <div className={s.solTag}>Editing</div>
              <h3>Raw footage → polished video</h3>
              <p>
                Record on your phone. Upload to TimeBack. It removes ums, silences, and
                dead air. You sound like a pro — even if you recorded in your car on lunch
                break.
              </p>
            </div>
            <div className={s.solCard}>
              <div className={s.solTag}>Captions</div>
              <h3>Captions added automatically</h3>
              <p>
                Every video gets styled captions. Your content works on mute — which is how
                most people scroll during their workday (just like you).
              </p>
            </div>
            <div className={s.solCard}>
              <div className={s.solTag}>Batch Upload</div>
              <h3>Record 50, upload once</h3>
              <p>
                Block out a Sunday. Batch-record all your videos back to back. Upload all
                50 and TimeBack edits every single one in parallel.
              </p>
            </div>
            <div className={s.solCard}>
              <div className={s.solTag}>Scheduling</div>
              <h3>Posts go out while you work</h3>
              <p>
                Auto-schedule to Instagram. Your content posts at 9am Tuesday while
                you&apos;re sitting in a team standup. Nobody at work needs to know.
              </p>
            </div>
            <div className={s.solCard}>
              <div className={s.solTag}>All-in-One</div>
              <h3>No juggling 5 apps</h3>
              <p>
                Replaces ChatGPT for scripts + CapCut for editing + Metricool for
                scheduling. One tool. One login. One less thing to manage.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SCRIPT IDEAS */}
      <section className={s.scripts}>
        <div className={s.container}>
          <div className={s.sectionLabel} style={{ textAlign: 'center' }}>Script Ideas</div>
          <h2>What side hustlers are posting this week</h2>
          <p className={s.scriptsSubtext}>
            TimeBack generates scripts based on your niche and audience. Here are some examples:
          </p>
          <div className={s.scriptExamples}>
            <div className={s.scriptCard}>
              <div className={s.scriptCat}>Authority</div>
              <h4>&quot;I spent 8 years in corporate finance. Here&apos;s what they don&apos;t teach you about money.&quot;</h4>
              <p>
                Your day job gave you expertise. Package it as content and people will pay
                for your perspective.
              </p>
            </div>
            <div className={s.scriptCard}>
              <div className={s.scriptCat}>Behind the Scenes</div>
              <h4>&quot;I&apos;m building a business before 8am and after 6pm. Here&apos;s what that looks like.&quot;</h4>
              <p>
                People love the journey. Being transparent about building on the side is
                incredibly relatable content.
              </p>
            </div>
            <div className={s.scriptCard}>
              <div className={s.scriptCat}>Problem Solving</div>
              <h4>&quot;3 mistakes I see people make with [your skill] every single day&quot;</h4>
              <p>
                Position yourself as the expert by calling out common mistakes in your
                niche. Gets saved and shared.
              </p>
            </div>
            <div className={s.scriptCard}>
              <div className={s.scriptCat}>Quick Wins</div>
              <h4>&quot;Do this one thing today and you&apos;ll [specific result] by Friday&quot;</h4>
              <p>
                Actionable, time-bound tips perform insanely well. Give people a quick win
                and they&apos;ll follow you for more.
              </p>
            </div>
            <div className={s.scriptCard}>
              <div className={s.scriptCat}>Myth Busting</div>
              <h4>&quot;You don&apos;t need 10K followers to make money online. Here&apos;s proof.&quot;</h4>
              <p>
                Challenge conventional wisdom. These posts spark debate, get comments, and
                the algorithm loves them.
              </p>
            </div>
            <div className={s.scriptCard}>
              <div className={s.scriptCat}>Social Proof</div>
              <h4>&quot;A stranger DM&apos;d me saying my free content helped them more than a $500 course&quot;</h4>
              <p>
                Share wins from your audience (even small ones). It builds credibility and
                attracts more people who want the same result.
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
                Tell TimeBack your niche and target audience. AI generates a batch of
                scroll-stopping scripts you can customize or use as-is. Takes 5 minutes.
              </p>
              <span className={s.timeTag}>⚡ 5 minutes</span>
            </div>
            <div className={s.step}>
              <div className={s.stepNum}>02</div>
              <h3>Batch record on Sunday</h3>
              <p>
                Film your videos back to back — phone, ring light, done. No teleprompter
                needed. Upload up to 50 at once. Just talk naturally.
              </p>
              <span className={s.timeTag}>⚡ 1–2 hours</span>
            </div>
            <div className={s.step}>
              <div className={s.stepNum}>03</div>
              <h3>Auto-edit & auto-post</h3>
              <p>
                TimeBack removes silences, adds captions, polishes your cuts, and
                auto-schedules everything to Instagram. Go back to your day job. Your brand
                builds itself.
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
              &quot;I work 50 hours a week in tech. TimeBack lets me batch-record on Sundays
              and my coaching content posts all month. I went from 200 followers to 4,000
              in 3 months — and signed my first 6 paying clients. All before quitting my
              job.&quot;
            </blockquote>
            <div className={s.author}>
              <div className={s.avatar}>K</div>
              <div>
                <div className={s.authorName}>Kevin M.</div>
                <div className={s.authorRole}>Software Engineer → Career Coach</div>
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
              Your future clients are scrolling right now.{' '}
              <em>Start showing up.</em>
            </h2>
            <p>One Sunday afternoon. 30 days of content. Build your exit plan.</p>
            <Link href="/sign-up" className={s.btn}>Start Creating Free →</Link>
            <div className={s.ctaFooter}>5 free videos · No credit card · Cancel anytime</div>
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
