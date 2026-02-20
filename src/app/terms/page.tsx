import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import MobileMenuToggle from '@/components/MobileMenuToggle'

export default async function TermsPage() {
  const { userId } = await auth()

  return (
    <div className="landing-page min-h-screen">
      {/* Header */}
      <nav className="lp-nav">
        <Link href="/" className="nav-logo">TimeBack</Link>
        <MobileMenuToggle />
        <div className="nav-links">
          <Link href="/pricing">Pricing</Link>
          <a href="https://www.youtube.com/playlist?list=PLhATaQNX0bxMeX0e8AA-TSk8L0g3t-QX7" target="_blank" rel="noopener noreferrer">Tutorials</a>
          {userId ? (
            <Link href="/dashboard" className="nav-cta">Dashboard</Link>
          ) : (
            <Link href="/sign-up" className="nav-cta">Start Free</Link>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-12 sm:py-16" style={{ paddingTop: '5rem' }}>
        <h1 className="text-3xl sm:text-4xl font-bold text-[#0a0a0a] mb-4" style={{ fontFamily: "'Instrument Serif', serif" }}>Terms and Conditions</h1>
        <p className="text-[#8a8580] mb-8">Last updated: February 1, 2026</p>

        <div className="space-y-8 text-[#0a0a0a]">
          <section>
            <h2 className="text-xl sm:text-2xl font-semibold text-[#0a0a0a] mb-4" style={{ fontFamily: "'Instrument Serif', serif" }}>1. Agreement to Terms</h2>
            <p className="leading-relaxed">
              By accessing or using TimeBack (&quot;the Service&quot;), operated by TimeBack (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;), you agree to be bound by these Terms and Conditions. If you do not agree to these terms, you may not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold text-[#0a0a0a] mb-4" style={{ fontFamily: "'Instrument Serif', serif" }}>2. Description of Service</h2>
            <p className="leading-relaxed">
              TimeBack is an AI-powered video editing platform that automatically detects and removes silences, filler words, and dead air from uploaded videos. The Service is available at timebackvideo.com and includes all related tools, features, and functionality.
            </p>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold text-[#0a0a0a] mb-4" style={{ fontFamily: "'Instrument Serif', serif" }}>3. Account Registration</h2>
            <div className="space-y-4">
              <p className="leading-relaxed">
                To use the Service, you must create an account. You agree to:
              </p>
              <ul className="list-disc list-inside space-y-2 leading-relaxed">
                <li>Provide accurate and complete registration information</li>
                <li>Maintain the security of your account credentials</li>
                <li>Accept responsibility for all activity that occurs under your account</li>
                <li>Notify us immediately of any unauthorized use of your account</li>
              </ul>
              <p className="leading-relaxed">
                You must be at least 13 years of age to use the Service. If you are under 18, you must have parental or guardian consent.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold text-[#0a0a0a] mb-4" style={{ fontFamily: "'Instrument Serif', serif" }}>4. Acceptable Use</h2>
            <p className="leading-relaxed mb-4">
              You agree not to use the Service to:
            </p>
            <ul className="list-disc list-inside space-y-2 leading-relaxed">
              <li>Upload, process, or distribute content that is illegal, harmful, threatening, abusive, defamatory, or otherwise objectionable</li>
              <li>Infringe upon or violate the intellectual property rights of others</li>
              <li>Upload content containing malware, viruses, or other harmful code</li>
              <li>Attempt to gain unauthorized access to the Service or its systems</li>
              <li>Interfere with or disrupt the Service or servers connected to the Service</li>
              <li>Use the Service for any purpose that violates applicable laws or regulations</li>
              <li>Resell or redistribute the Service without our written consent</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold text-[#0a0a0a] mb-4" style={{ fontFamily: "'Instrument Serif', serif" }}>5. Content Ownership</h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium text-[#0a0a0a] mb-2">Your Content</h3>
                <p className="leading-relaxed">
                  You retain all ownership rights to the videos and content you upload to the Service. By uploading content, you grant us a limited, non-exclusive license to process, store, and transmit your content solely for the purpose of providing the Service to you.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-medium text-[#0a0a0a] mb-2">Our Content</h3>
                <p className="leading-relaxed">
                  The Service, including its design, features, code, and branding, is owned by TimeBack and protected by intellectual property laws. You may not copy, modify, distribute, or reverse engineer any part of the Service.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold text-[#0a0a0a] mb-4" style={{ fontFamily: "'Instrument Serif', serif" }}>6. Subscription Plans and Payment</h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium text-[#0a0a0a] mb-2">Free Plan</h3>
                <p className="leading-relaxed">
                  We offer a free tier with limited usage. Free plan features and limits may change at any time.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-medium text-[#0a0a0a] mb-2">Paid Plans</h3>
                <p className="leading-relaxed">
                  Paid subscriptions are billed on a recurring monthly basis. By subscribing to a paid plan, you authorize us to charge your payment method on file for the applicable fees. All prices are in USD unless otherwise stated.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-medium text-[#0a0a0a] mb-2">Cancellation</h3>
                <p className="leading-relaxed">
                  You may cancel your subscription at any time. Upon cancellation, you will retain access to your paid plan until the end of your current billing period. No refunds will be issued for partial billing periods unless covered by our money-back guarantee.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-medium text-[#0a0a0a] mb-2">Money-Back Guarantee</h3>
                <p className="leading-relaxed">
                  We offer a 30-day money-back guarantee on all paid plans. If you are not satisfied within the first 30 days of your subscription, contact us for a full refund.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold text-[#0a0a0a] mb-4" style={{ fontFamily: "'Instrument Serif', serif" }}>7. Video Processing and Storage</h2>
            <div className="space-y-4">
              <p className="leading-relaxed">
                When you upload a video for processing:
              </p>
              <ul className="list-disc list-inside space-y-2 leading-relaxed">
                <li>Videos are temporarily stored on our secure servers during processing</li>
                <li>Processed videos are available for download for a limited time after processing completes</li>
                <li>We automatically delete uploaded and processed video files within 24 hours of processing completion</li>
                <li>We are not responsible for any loss of content if you fail to download your processed videos within the available timeframe</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold text-[#0a0a0a] mb-4" style={{ fontFamily: "'Instrument Serif', serif" }}>8. Third-Party Integrations</h2>
            <p className="leading-relaxed">
              The Service may integrate with third-party services such as Google Drive and Instagram. Your use of these integrations is subject to the respective third-party terms of service and privacy policies. We are not responsible for the practices or content of third-party services.
            </p>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold text-[#0a0a0a] mb-4" style={{ fontFamily: "'Instrument Serif', serif" }}>9. Service Availability</h2>
            <p className="leading-relaxed">
              We strive to maintain high availability but do not guarantee uninterrupted access to the Service. We may temporarily suspend or restrict access for maintenance, updates, or other reasons. We will make reasonable efforts to provide advance notice of planned downtime.
            </p>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold text-[#0a0a0a] mb-4" style={{ fontFamily: "'Instrument Serif', serif" }}>10. Limitation of Liability</h2>
            <p className="leading-relaxed">
              To the fullest extent permitted by law, TimeBack shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of data, revenue, profits, or business opportunities, arising from your use of the Service. Our total liability for any claim arising from these Terms or the Service shall not exceed the amount you paid to us in the twelve (12) months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold text-[#0a0a0a] mb-4" style={{ fontFamily: "'Instrument Serif', serif" }}>11. Disclaimer of Warranties</h2>
            <p className="leading-relaxed">
              The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, either express or implied, including but not limited to implied warranties of merchantability, fitness for a particular purpose, and non-infringement. We do not warrant that the Service will be error-free, secure, or available at all times.
            </p>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold text-[#0a0a0a] mb-4" style={{ fontFamily: "'Instrument Serif', serif" }}>12. Indemnification</h2>
            <p className="leading-relaxed">
              You agree to indemnify, defend, and hold harmless TimeBack and its officers, directors, employees, and agents from any claims, liabilities, damages, losses, and expenses arising from your use of the Service, your violation of these Terms, or your violation of any rights of a third party.
            </p>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold text-[#0a0a0a] mb-4" style={{ fontFamily: "'Instrument Serif', serif" }}>13. Termination</h2>
            <p className="leading-relaxed">
              We may suspend or terminate your account and access to the Service at our sole discretion, without prior notice, for conduct that we determine violates these Terms or is harmful to other users, us, or third parties. Upon termination, your right to use the Service ceases immediately.
            </p>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold text-[#0a0a0a] mb-4" style={{ fontFamily: "'Instrument Serif', serif" }}>14. Changes to Terms</h2>
            <p className="leading-relaxed">
              We reserve the right to modify these Terms at any time. We will notify you of significant changes by posting updated Terms on this page and updating the &quot;Last updated&quot; date. Your continued use of the Service after changes constitutes acceptance of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold text-[#0a0a0a] mb-4" style={{ fontFamily: "'Instrument Serif', serif" }}>15. Governing Law</h2>
            <p className="leading-relaxed">
              These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which TimeBack operates, without regard to conflict of law provisions.
            </p>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold text-[#0a0a0a] mb-4" style={{ fontFamily: "'Instrument Serif', serif" }}>16. Contact Us</h2>
            <p className="leading-relaxed">
              If you have questions about these Terms and Conditions, please contact us at:
            </p>
            <p className="mt-4">
              <a href="mailto:support@timebackvideo.com" className="text-[#e85d26] hover:text-[#d14d1a] transition-colors">
                support@timebackvideo.com
              </a>
            </p>
          </section>
        </div>
      </div>

      {/* Footer */}
      <footer className="lp-footer">
        <div className="footer-logo">TimeBack</div>
        <div className="footer-links">
          <Link href="/pricing">Pricing</Link>
          <a href="https://www.youtube.com/playlist?list=PLhATaQNX0bxMeX0e8AA-TSk8L0g3t-QX7" target="_blank" rel="noopener noreferrer">Tutorials</a>
          <a href="mailto:support@timebackvideo.com">Support</a>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </div>
        <div className="copyright">&copy; 2026 TimeBack. All rights reserved.</div>
      </footer>
    </div>
  )
}
