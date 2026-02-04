import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { GoogleAnalytics } from "@/components/Analytics";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import "./globals.css";

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: "TimeBack - Remove Silence from Videos Automatically",
  description: "Save hours of editing time. TimeBack uses AI to automatically remove silence, filler words, and dead air from your videos.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="font-sans antialiased">
          <GoogleAnalytics />
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </body>
      </html>
    </ClerkProvider>
  );
}
