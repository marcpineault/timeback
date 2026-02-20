import Link from 'next/link'
import type { Metadata } from 'next'
import s from './page.module.css'
import MobileMenuToggle from '@/components/MobileMenuToggle'

export const metadata: Metadata = {
  title: 'TimeBack for Real Estate Agents — Become the Agent Everyone Calls First',
  description:
    'TimeBack writes your scripts, edits your videos, and posts to Instagram on autopilot. Become the local market expert — without spending hours on content. Built for real estate agents.',
}

export default function RealEstateAgentsPage() {
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
            <span className={s.dot}></span> Built for Real Estate Agents
          </div>
          <h1>
            The agent who shows up in their feed{' '}
            <em>gets the listing.</em>
          </h1>
          <p>
            TimeBack writes your scripts, edits your videos, and posts to
            Instagram on autopilot. Become the local market expert — without
            spending hours on content.
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
          <h2>There are 1.5 million agents in the US. Why should someone pick you?</h2>
          <p>
            The agents dominating their market aren&apos;t the ones with the best
            listings — they&apos;re the ones who&apos;ve built familiarity and trust
            through content before a seller ever calls.
          </p>
          <div className={s.painGrid}>
            <div className={s.painCard}>
              <div className={s.icon}>👻</div>
              <h4>You&apos;re invisible online</h4>
              <p>
                When someone Googles &ldquo;best realtor in [your city]&rdquo; — you&apos;re
                not showing up. And the agents who are? They&apos;re posting video
                consistently.
              </p>
            </div>
            <div className={s.painCard}>
              <div className={s.icon}>📱</div>
              <h4>Zillow owns your leads</h4>
              <p>
                You&apos;re paying for leads that 5 other agents also got. Video
                content creates your own pipeline — people who already know and
                trust you.
              </p>
            </div>
            <div className={s.painCard}>
              <div className={s.icon}>🏃</div>
              <h4>Too busy showing homes to create content</h4>
              <p>
                Between showings, open houses, and closings — who has time to
                script, film, edit, and post? That&apos;s a second job.
              </p>
            </div>
            <div className={s.painCard}>
              <div className={s.icon}>🎬</div>
              <h4>Your videos sit unedited in your camera roll</h4>
              <p>
                You filmed walkthroughs last weekend. They&apos;re still raw. You
                know you should post them but editing feels like climbing Everest.
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
          <h2>Own your market, one video at a time</h2>
          <p className={s.solutionSubtext}>
            TimeBack handles scripts, editing, captions, and posting — so one
            recording session fills your Instagram for the entire month.
          </p>
          <div className={s.solGrid}>
            <div className={s.solCard}>
              <div className={s.solTag}>Local Expert</div>
              <h3>Scripts for your market</h3>
              <p>
                AI generates topics like &ldquo;Top 3 neighborhoods in [your city]
                for first-time buyers&rdquo; or &ldquo;What $500K gets you right
                now.&rdquo; Hyper-local, hyper-relevant.
              </p>
            </div>
            <div className={s.solCard}>
              <div className={s.solTag}>Fast Editing</div>
              <h3>Polished in seconds</h3>
              <p>
                Film a walkthrough or talking head, upload it, and TimeBack removes
                dead air, adds captions, and tightens pacing. No editing skills
                needed.
              </p>
            </div>
            <div className={s.solCard}>
              <div className={s.solTag}>Captions</div>
              <h3>Feed-friendly by default</h3>
              <p>
                Auto-captions on every video. Buyers scroll on mute — your message
                still lands.
              </p>
            </div>
            <div className={s.solCard}>
              <div className={s.solTag}>Batch Upload</div>
              <h3>50 walkthroughs at once</h3>
              <p>
                Record a batch of talking heads, market updates, and listing tours.
                Upload all 50. TimeBack edits every one.
              </p>
            </div>
            <div className={s.solCard}>
              <div className={s.solTag}>Scheduling</div>
              <h3>Auto-post to Instagram</h3>
              <p>
                Consistent posting = top of mind. When someone in your area is
                ready to sell, you&apos;re the first agent they think of.
              </p>
            </div>
            <div className={s.solCard}>
              <div className={s.solTag}>Sphere Building</div>
              <h3>Stay in front of your sphere</h3>
              <p>
                Past clients see your content and refer you. Potential sellers see
                your market knowledge and reach out. The feed does your farming for
                you.
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
          <h2>What top-producing agents are recording this week</h2>
          <p className={s.scriptsSubtext}>
            TimeBack generates scripts tailored to real estate. Here&apos;s a sample:
          </p>
          <div className={s.scriptExamples}>
            <div className={s.scriptCard}>
              <div className={s.scriptCat}>Market Update</div>
              <h4>
                &ldquo;Here&apos;s what happened in [City] real estate this
                month&rdquo;
              </h4>
              <p>
                Monthly market updates make you the go-to source. Sellers call the
                agent who clearly knows the numbers.
              </p>
            </div>
            <div className={s.scriptCard}>
              <div className={s.scriptCat}>Buyer Tips</div>
              <h4>
                &ldquo;3 mistakes first-time buyers make (and how to avoid
                them)&rdquo;
              </h4>
              <p>
                Educational content builds trust with buyers before they even start
                searching on Zillow.
              </p>
            </div>
            <div className={s.scriptCard}>
              <div className={s.scriptCat}>Neighborhood Guide</div>
              <h4>
                &ldquo;Living in [Neighborhood]: the honest truth&rdquo;
              </h4>
              <p>
                Hyper-local content that ranks in search AND gets shared by locals.
                Double win.
              </p>
            </div>
            <div className={s.scriptCard}>
              <div className={s.scriptCat}>Seller Strategy</div>
              <h4>
                &ldquo;Thinking of selling? Do these 5 things first&rdquo;
              </h4>
              <p>
                Attract pre-listing leads by showing your expertise before they
                ever interview agents.
              </p>
            </div>
            <div className={s.scriptCard}>
              <div className={s.scriptCat}>Behind the Scenes</div>
              <h4>
                &ldquo;Day in the life of a realtor (it&apos;s not what you
                think)&rdquo;
              </h4>
              <p>
                Personality-driven content that makes people feel like they know
                you. Familiarity breeds trust.
              </p>
            </div>
            <div className={s.scriptCard}>
              <div className={s.scriptCat}>Just Sold</div>
              <h4>
                &ldquo;Just helped my client save $40K — here&apos;s how&rdquo;
              </h4>
              <p>
                Social proof without being salesy. Show results, attract similar
                clients.
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
                Tell TimeBack you&apos;re a real estate agent and your market. AI
                generates a batch of local-market scripts you can customize or use
                as-is.
              </p>
              <span className={s.timeTag}>⚡ 5 minutes</span>
            </div>
            <div className={s.step}>
              <div className={s.stepNum}>02</div>
              <h3>Batch record &amp; upload</h3>
              <p>
                Film talking heads, walkthroughs, or market updates back to back.
                Upload up to 50 at once. Just talk — AI handles the rest.
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
              &ldquo;I posted market updates and neighborhood guides for 90 days
              straight using TimeBack. Got 4 listing appointments from people who
              said &lsquo;I&apos;ve been watching your videos.&rsquo; That&apos;s
              $40K+ in commission from a $39/month tool.&rdquo;
            </blockquote>
            <div className={s.author}>
              <div className={s.avatar}>D</div>
              <div>
                <div className={s.authorName}>David L.</div>
                <div className={s.authorRole}>Realtor, Keller Williams</div>
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
              The top agent in your market is posting video.{' '}
              <em>Are you?</em>
            </h2>
            <p>
              One afternoon. 30 days of content. Become the agent everyone calls
              first.
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
