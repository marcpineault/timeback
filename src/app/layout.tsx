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
  title: "TimeBack — A Month of Content in One Afternoon",
  description: "TimeBack writes your scripts, edits your videos, and posts to Instagram — all on autopilot. Upload a batch, walk away with a full content calendar.",
};

// Read at module level so it's available during both build and runtime.
// At build time this may be undefined (no .env); at runtime on Railway it
// will be set, and dynamic (SSR) pages will pick it up from process.env.
const clerkPubKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

const headLinks = (
  <>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
    <link
      href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap"
      rel="stylesheet"
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
          <GoogleAnalytics gaId={gaMeasurementId} />
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
          <GoogleAnalytics gaId={gaMeasurementId} />
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
