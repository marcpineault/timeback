import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'

export default async function PrivacyPage() {
  const { userId } = await auth()

  return (
    <div className="min-h-screen bg-[#0F0F14]">
      {/* Header */}
      <header className="border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo.svg" alt="TimeBack" className="w-8 h-8" />
            <span className="text-xl font-bold text-white">TimeBack</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/pricing" className="text-gray-400 hover:text-white transition-colors text-sm sm:text-base">
              Pricing
            </Link>
            <a
              href="https://www.youtube.com/playlist?list=PLhATaQNX0bxMeX0e8AA-TSk8L0g3t-QX7"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-white transition-colors text-sm sm:text-base"
            >
              Tutorials
            </a>
            {userId ? (
              <Link
                href="/dashboard"
                className="px-3 sm:px-4 py-2 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white rounded-lg font-medium transition-colors text-sm sm:text-base"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link href="/sign-in" className="hidden sm:block text-gray-400 hover:text-white transition-colors">
                  Sign In
                </Link>
                <Link
                  href="/sign-up"
                  className="px-3 sm:px-4 py-2 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white rounded-lg font-medium transition-colors text-sm sm:text-base"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-12 sm:py-16">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">Privacy Policy</h1>
        <p className="text-gray-400 mb-8">Last updated: February 1, 2026</p>

        <div className="space-y-8 text-gray-300">
          <section>
            <h2 className="text-xl sm:text-2xl font-semibold text-white mb-4">Introduction</h2>
            <p className="leading-relaxed">
              TimeBack (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our video editing service at timebackvideo.com.
            </p>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold text-white mb-4">Information We Collect</h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium text-white mb-2">Account Information</h3>
                <p className="leading-relaxed">
                  When you create an account, we collect your email address and authentication information through our authentication provider, Clerk. This information is necessary to provide you access to our services.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-medium text-white mb-2">Video Content</h3>
                <p className="leading-relaxed">
                  When you upload videos for processing, we temporarily store your video files on our secure servers. Videos are processed using our AI-powered silence detection technology and are automatically deleted after processing is complete and you have downloaded your results.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-medium text-white mb-2">Usage Data</h3>
                <p className="leading-relaxed">
                  We collect information about how you use our service, including the number of videos processed, processing settings, and feature usage. This helps us improve our service and provide you with a better experience.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-medium text-white mb-2">Payment Information</h3>
                <p className="leading-relaxed">
                  Payment processing is handled by our third-party payment processor. We do not store your full credit card details on our servers. We only retain transaction records necessary for billing and account management.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold text-white mb-4">How We Use Your Information</h2>
            <ul className="list-disc list-inside space-y-2 leading-relaxed">
              <li>To provide, maintain, and improve our video editing services</li>
              <li>To process your videos and deliver results</li>
              <li>To manage your account and provide customer support</li>
              <li>To process payments and send transaction notifications</li>
              <li>To send service-related communications and updates</li>
              <li>To detect, prevent, and address technical issues or abuse</li>
              <li>To comply with legal obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold text-white mb-4">Data Storage and Security</h2>
            <p className="leading-relaxed mb-4">
              We implement industry-standard security measures to protect your information. Your data is stored on secure cloud servers with encryption at rest and in transit.
            </p>
            <p className="leading-relaxed">
              Uploaded videos are temporarily stored only for the duration needed to complete processing. Once you download your processed video, the original and processed files are automatically deleted from our servers within 24 hours.
            </p>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold text-white mb-4">Third-Party Services</h2>
            <p className="leading-relaxed mb-4">
              We use trusted third-party services to operate our platform:
            </p>
            <ul className="list-disc list-inside space-y-2 leading-relaxed">
              <li><strong className="text-white">Clerk</strong> - Authentication and user management</li>
              <li><strong className="text-white">Amazon Web Services (AWS)</strong> - Cloud infrastructure and video storage</li>
              <li><strong className="text-white">Google Drive</strong> - Optional integration for exporting processed videos (only if you choose to connect)</li>
              <li><strong className="text-white">Stripe</strong> - Payment processing</li>
            </ul>
            <p className="leading-relaxed mt-4">
              These services have their own privacy policies governing the use of your information.
            </p>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold text-white mb-4">Your Rights</h2>
            <p className="leading-relaxed mb-4">
              You have the following rights regarding your personal information:
            </p>
            <ul className="list-disc list-inside space-y-2 leading-relaxed">
              <li><strong className="text-white">Access</strong> - Request a copy of your personal data</li>
              <li><strong className="text-white">Correction</strong> - Request correction of inaccurate data</li>
              <li><strong className="text-white">Deletion</strong> - Request deletion of your account and associated data</li>
              <li><strong className="text-white">Export</strong> - Request a portable copy of your data</li>
              <li><strong className="text-white">Opt-out</strong> - Unsubscribe from marketing communications</li>
            </ul>
            <p className="leading-relaxed mt-4">
              To exercise any of these rights, please contact us at{' '}
              <a href="mailto:support@timebackvideo.com" className="text-violet-400 hover:text-violet-300 transition-colors">
                support@timebackvideo.com
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold text-white mb-4">Cookies</h2>
            <p className="leading-relaxed">
              We use essential cookies to maintain your session and provide core functionality. We do not use advertising or tracking cookies. Third-party services we integrate with may set their own cookies according to their privacy policies.
            </p>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold text-white mb-4">Children&apos;s Privacy</h2>
            <p className="leading-relaxed">
              Our service is not directed to children under 13 years of age. We do not knowingly collect personal information from children under 13. If you believe we have collected information from a child under 13, please contact us immediately.
            </p>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold text-white mb-4">Changes to This Policy</h2>
            <p className="leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any significant changes by posting the new policy on this page and updating the &quot;Last updated&quot; date. We encourage you to review this policy periodically.
            </p>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold text-white mb-4">Contact Us</h2>
            <p className="leading-relaxed">
              If you have questions or concerns about this Privacy Policy or our data practices, please contact us at:
            </p>
            <p className="mt-4">
              <a href="mailto:support@timebackvideo.com" className="text-violet-400 hover:text-violet-300 transition-colors">
                support@timebackvideo.com
              </a>
            </p>
          </section>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-gray-800">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <img src="/logo.svg" alt="TimeBack" className="w-6 h-6" />
              <span className="text-white font-semibold">TimeBack</span>
              <span className="text-gray-500 text-sm hidden sm:inline">- Video editing made simple</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-sm text-gray-500">
              <Link href="/pricing" className="hover:text-gray-300 transition-colors">Pricing</Link>
              <a
                href="https://www.youtube.com/playlist?list=PLhATaQNX0bxMeX0e8AA-TSk8L0g3t-QX7"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-gray-300 transition-colors"
              >
                Tutorials
              </a>
              <a href="mailto:support@timebackvideo.com" className="hover:text-gray-300 transition-colors">Support</a>
              <Link href="/privacy" className="hover:text-gray-300 transition-colors">Privacy</Link>
            </div>
          </div>
          <div className="mt-6 pt-6 border-t border-gray-800 text-center text-gray-500 text-sm">
            &copy; {new Date().getFullYear()} TimeBack. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}
