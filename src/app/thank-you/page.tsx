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
    <div className="min-h-screen bg-[#0F0F14] flex items-center justify-center">
      <div className="bg-[#1A1A24] rounded-xl p-8 max-w-md text-center">
        <h1 className="text-2xl font-bold text-white mb-3">
          Thank you for subscribing!
        </h1>
        <p className="text-gray-400 mb-6">
          Your subscription is active. You can now start processing your videos.
        </p>
        <Link
          href="/dashboard"
          className="inline-block px-6 py-3 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white rounded-lg font-medium transition-colors"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
