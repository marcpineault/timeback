import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { GoogleAnalytics } from "@/components/Analytics";
import { FacebookPixel } from "@/components/FacebookPixel";
import { UtmCapture } from "@/components/UtmCapture";
import { SourceTracker } from "@/components/SourceTracker";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import ToastProvider from "@/components/ToastProvider";
import "./globals.css";

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: {
    default: "TimeBack — AI Video Content Platform for Professionals",
    template: "%s | TimeBack",
  },
  description: "TimeBack is a video content creation platform that helps financial advisors, real estate agents, mortgage brokers, and lawyers create 30 days of social media video content in under an hour. AI writes scripts, auto-edits videos with silence removal and captions, and schedules posts to Instagram.",
  metadataBase: new URL("https://www.timebackvideo.com"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://www.timebackvideo.com",
    siteName: "TimeBack",
    title: "TimeBack — AI Video Content Platform for Professionals",
    description: "Create 30 days of social media video content in under an hour. TimeBack writes scripts, auto-edits videos, adds captions, and schedules posts to Instagram. Built for financial advisors, real estate agents, mortgage brokers, and lawyers.",
    images: [
      {
        url: "https://www.timebackvideo.com/og-image.png",
        width: 1200,
        height: 630,
        alt: "TimeBack — AI Video Content Platform for Professionals",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "TimeBack — AI Video Content Platform for Professionals",
    description: "Create 30 days of social media video content in under an hour. AI scripts, auto-editing, captions, and Instagram scheduling for professionals.",
    images: ["https://www.timebackvideo.com/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  keywords: [
    "video content creation",
    "social media video tool",
    "AI video editing",
    "video content for financial advisors",
    "video content for real estate agents",
    "video content for mortgage brokers",
    "video content for lawyers",
    "Instagram video scheduling",
    "auto caption videos",
    "silence removal",
    "batch video editing",
    "content creation platform",
    "video marketing for professionals",
  ],
};

// Read at module level so it's available during both build and runtime.
// At build time this may be undefined (no .env); at runtime on Railway it
// will be set, and dynamic (SSR) pages will pick it up from process.env.
const clerkPubKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "TimeBack",
  url: "https://www.timebackvideo.com",
  logo: "https://www.timebackvideo.com/logo.svg",
  description:
    "TimeBack is a video content creation platform that helps professionals — financial advisors, real estate agents, mortgage brokers, lawyers, and other service professionals — create 30 days of social media video content in under an hour. It combines AI script generation, automatic video editing with silence removal, auto-captioning, and Instagram scheduling into a single tool.",
  foundingDate: "2025",
  contactPoint: {
    "@type": "ContactPoint",
    email: "support@timebackvideo.com",
    contactType: "customer support",
  },
  sameAs: [
    "https://www.youtube.com/playlist?list=PLhATaQNX0bxMeX0e8AA-TSk8L0g3t-QX7",
  ],
}

const headLinks = (
  <>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
    <link
      href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap"
      rel="stylesheet"
    />
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
    />
  </>
)

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // During static prerendering at build time the Clerk key may not be
  // available.  Skip the provider so the build succeeds — all auth-gated
  // pages are dynamically rendered at request time when the key IS present.
  // SourceTracker uses useUser() and requires ClerkProvider, so it is only
  // rendered in the Clerk-enabled path.
  if (!clerkPubKey) {
    return (
      <html lang="en">
        <head>{headLinks}</head>
        <body className="font-sans antialiased">
          <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID} />
          <FacebookPixel />
          <UtmCapture />
          <ErrorBoundary>
            <ToastProvider>
              {children}
            </ToastProvider>
          </ErrorBoundary>
        </body>
      </html>
    )
  }

  return (
    <ClerkProvider publishableKey={clerkPubKey}>
      <html lang="en">
        <head>{headLinks}</head>
        <body className="font-sans antialiased">
          <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID} />
          <FacebookPixel />
          <UtmCapture />
          <SourceTracker />
          <ErrorBoundary>
            <ToastProvider>
              {children}
            </ToastProvider>
          </ErrorBoundary>
        </body>
      </html>
    </ClerkProvider>
  );
}
