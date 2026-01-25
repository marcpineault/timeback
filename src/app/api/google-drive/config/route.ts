import { NextResponse } from 'next/server';
import { isGoogleDriveConfigured, getRedirectUri } from '@/lib/googleDrive';

export async function GET() {
  const redirectUri = isGoogleDriveConfigured() ? getRedirectUri() : null;

  return NextResponse.json({
    configured: isGoogleDriveConfigured(),
    redirectUri,
    // Help message for redirect_uri_mismatch errors
    helpMessage: redirectUri
      ? `Add this exact URI to your Google Cloud Console OAuth 2.0 credentials: ${redirectUri}`
      : 'Google Drive is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.',
  });
}
