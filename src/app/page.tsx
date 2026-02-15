import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import ScrollReveal from '@/components/ScrollReveal'

export default async function LandingPage() {
  const { userId } = await auth()

  if (userId) {
    redirect('/dashboard')
  }

  return (
    <div className="landing-page">
      <ScrollReveal />

      {/* NAV */}
      <nav className="lp-nav">
        <Link href="/" className="nav-logo">TimeBack</Link>
        <div className="nav-links">
          <a href="#how-it-works">How It Works</a>
          <a href="#pricing">Pricing</a>
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
        <div className="hero-badge"><span></span> AI-powered content creation</div>
        <h1>A month of content. <em>In one hour.</em></h1>
        <p className="hero-sub">
          TimeBack writes your scripts, edits your videos, and posts to Instagram — all on autopilot. No content experience needed.
        </p>
        <div className="hero-ctas">
          <Link href="/sign-up" className="btn-primary">Start Creating Free →</Link>
          <a href="#how-it-works" className="btn-secondary">See how it works</a>
        </div>
        <p className="hero-proof">No credit card required · <strong>5 free videos</strong> to start · Cancel anytime</p>

        {/* HERO SCREENSHOTS */}
        <div className="hero-screenshots-wrapper">
          <div className="hero-screenshot hero-screenshot-main">
            <img src="/screenshot-editor.png" alt="TimeBack video editor — upload, process, and download videos automatically" />
          </div>
          <div className="hero-screenshot hero-screenshot-secondary">
            <img src="/screenshot-ideate.png" alt="TimeBack Ideate — AI-powered inspiration and swipe file for creators" />
          </div>
        </div>
      </section>

      {/* NUMBERS */}
      <div className="lp-numbers">
        <div className="number-item">
          <div className="big">50</div>
          <div className="label">Videos per batch upload</div>
        </div>
        <div className="number-item">
          <div className="big">0</div>
          <div className="label">Editing skills needed</div>
        </div>
        <div className="number-item">
          <div className="big">1</div>
          <div className="label">Afternoon to a month of content</div>
        </div>
      </div>

      {/* PROBLEM */}
      <section className="lp-problem reveal">
        <div className="section-label">The Problem</div>
        <h2>You know you should be posting. But you&apos;re not.</h2>
        <p>You&apos;re good at what you do — coaching, selling homes, advising clients. But growing on social media feels like a second full-time job you didn&apos;t sign up for.</p>
        <div className="pain-grid">
          <div className="pain-card">
            <div className="icon">⏰</div>
            <h4>No time to edit</h4>
            <p>You recorded 10 videos last weekend. They&apos;re still sitting in your camera roll, unedited.</p>
          </div>
          <div className="pain-card">
            <div className="icon">🤷</div>
            <h4>No idea what to say</h4>
            <p>Staring at the camera with nothing to talk about is worse than not posting at all.</p>
          </div>
          <div className="pain-card">
            <div className="icon">💸</div>
            <h4>Can&apos;t afford an agency</h4>
            <p>$2K–$5K/month for a content agency isn&apos;t realistic when you&apos;re building your business.</p>
          </div>
          <div className="pain-card">
            <div className="icon">📉</div>
            <h4>Inconsistent posting</h4>
            <p>You go hard for a week, disappear for a month, then wonder why nobody&apos;s engaging.</p>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="lp-how reveal" id="how-it-works">
        <div className="section-label">How It Works</div>
        <h2>From zero to a full feed in 3 steps</h2>
        <div className="steps">
          <div className="step">
            <div className="step-number">01</div>
            <h3>Pick your topics</h3>
            <p>Tell TimeBack your industry and audience. AI generates a batch of scroll-stopping scripts you can customize or use as-is.</p>
            <span className="time-tag">⚡ 5 minutes</span>
          </div>
          <div className="step">
            <div className="step-number">02</div>
            <h3>Batch record &amp; upload</h3>
            <p>Film your videos back to back, then upload up to 50 at once. No teleprompter needed — just talk and AI handles the rest.</p>
            <span className="time-tag">⚡ 1–2 hours</span>
          </div>
          <div className="step">
            <div className="step-number">03</div>
            <h3>Auto-edit &amp; auto-post</h3>
            <p>TimeBack removes silences, adds captions, polishes your cuts, and auto-schedules everything to Instagram. You&apos;re done.</p>
            <span className="time-tag">⚡ Automatic</span>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="lp-features reveal">
        <div className="section-label">Features</div>
        <h2>Everything between &ldquo;record&rdquo; and &ldquo;posted&rdquo;</h2>
        <div className="feature-grid">
          <div className="feature-card highlight">
            <span className="feature-tag">Core Feature</span>
            <h3>Bulk upload. Bulk edit. Bulk schedule.</h3>
            <p>Upload up to 50 raw videos at once. TimeBack edits every single one — removing dead air, adding captions, tightening pacing — then queues them all to post. One session, one month of content.</p>
          </div>
          <div className="feature-card">
            <span className="feature-tag">AI Scripts</span>
            <h3>Never run out of things to say</h3>
            <p>AI generates video scripts tailored to your industry and audience. Pick the ones you like, hit record, and read.</p>
          </div>
          <div className="feature-card">
            <span className="feature-tag">Smart Editing</span>
            <h3>Silence removal that just works</h3>
            <p>Awkward pauses, ums, dead air — all cut automatically. Your videos sound crisp and confident without touching an editor.</p>
          </div>
          <div className="feature-card">
            <span className="feature-tag">Captions</span>
            <h3>Auto-captions on every video</h3>
            <p>Captions added automatically so your content works in the feed with sound off — where most people scroll.</p>
          </div>
          <div className="feature-card">
            <span className="feature-tag">Scheduling</span>
            <h3>Auto-post to Instagram</h3>
            <p>Set it and forget it. TimeBack publishes your finished videos on a schedule so you stay consistent without thinking about it.</p>
          </div>
        </div>
      </section>

      {/* WHO IT'S FOR */}
      <section className="lp-audience reveal">
        <div className="section-label">Who It&apos;s For</div>
        <h2>Built for experts, not influencers</h2>
        <p>You don&apos;t need to be a content creator. You just need something worth saying.</p>
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

      {/* COMPARISON */}
      <section className="lp-comparison reveal">
        <div className="section-label">Why TimeBack</div>
        <h2>The math is simple</h2>
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
        <h2>People are saving hours every week</h2>
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

      {/* PRICING */}
      <section className="lp-pricing reveal" id="pricing">
        <div className="section-label">Pricing</div>
        <h2>Less than your morning coffee habit</h2>
        <p>Start free. Upgrade when you&apos;re hooked.</p>
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
        <h2>Stop overthinking. <em>Start posting.</em></h2>
        <p>Your next 30 days of content are one afternoon away. No editing skills. No content calendar anxiety. Just results.</p>
        <Link href="/sign-up" className="btn-primary" style={{ fontSize: '1.1rem', padding: '1.1rem 2.8rem' }}>Start Creating Free →</Link>
        <div className="final-footer">5 free videos · No credit card · Cancel anytime</div>
      </section>

      {/* FOOTER */}
      <footer className="lp-footer">
        <div className="footer-logo">TimeBack</div>
        <div className="footer-links">
          <Link href="/pricing">Pricing</Link>
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
