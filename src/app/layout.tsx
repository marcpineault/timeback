import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { GoogleAnalytics } from "@/components/Analytics";
import { FacebookPixel } from "@/components/FacebookPixel";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link
            href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap"
            rel="stylesheet"
          />
        </head>
        <body className="font-sans antialiased">
          <GoogleAnalytics />
          <FacebookPixel />
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
