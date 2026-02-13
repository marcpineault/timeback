import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { GoogleAnalytics } from "@/components/Analytics";
import { FacebookPixel } from "@/components/FacebookPixel";
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
  title: "TimeBack - Become the Authority in Your Industry with AI-Powered Content",
  description: "TimeBack is AI software that writes your scripts, edits your videos, and posts for you — so you become the go-to authority in your industry without breaking the bank. No content experience needed.",
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
          <FacebookPixel />
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </body>
      </html>
    </ClerkProvider>
  );
}
