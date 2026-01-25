import { NextResponse } from 'next/server';
import { isGoogleDriveConfigured } from '@/lib/googleDrive';

export async function GET() {
  // Build the expected redirect URI for debugging OAuth configuration
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${appUrl}/api/auth/google/callback`;

  return NextResponse.json({
    configured: isGoogleDriveConfigured(),
    // Include redirect URI to help debug OAuth configuration
    expectedRedirectUri: redirectUri,
    appUrl: appUrl,
  });
}
