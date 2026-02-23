import { headers } from 'next/headers'
import Link from 'next/link'

export default async function NotFound() {
  // Force dynamic rendering so this page is not statically prerendered
  // (static prerender fails because ClerkProvider requires env vars at build time)
  await headers()

  return (
    <div className="landing-page min-h-screen flex items-center justify-center">
      <div className="bg-white border border-[#e0dbd4] rounded-2xl p-8 max-w-md text-center">
        <h1
          className="text-3xl font-bold text-[#0a0a0a] mb-2"
          style={{ fontFamily: "'Instrument Serif', serif" }}
        >
          Page not found
        </h1>
        <p className="text-[#8a8580] mb-6">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-2.5 bg-[#e85d26] hover:bg-[#d14d1a] text-white rounded-full font-medium transition-colors"
        >
          Go Home
        </Link>
      </div>
    </div>
  )
}
