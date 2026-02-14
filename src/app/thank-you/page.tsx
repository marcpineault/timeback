'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function ThankYouPage() {
  useEffect(() => {
    if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
      window.fbq('track', 'Purchase', {
        currency: 'USD',
        content_name: 'TimeBack Subscription',
      });
    }
  }, []);

  return (
    <div className="landing-page min-h-screen flex items-center justify-center">
      <div className="bg-white border border-[#e0dbd4] rounded-2xl p-8 max-w-md text-center">
        <div className="w-16 h-16 bg-[rgba(232,93,38,0.1)] rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-[#e85d26]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-[#0a0a0a] mb-3" style={{ fontFamily: "'Instrument Serif', serif" }}>
          Thank you for subscribing!
        </h1>
        <p className="text-[#8a8580] mb-6">
          Your subscription is active. You can now start processing your videos.
        </p>
        <Link
          href="/dashboard"
          className="inline-block px-6 py-3 bg-[#e85d26] hover:bg-[#d14d1a] text-white rounded-full font-semibold transition-all hover:-translate-y-0.5 hover:shadow-lg"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
