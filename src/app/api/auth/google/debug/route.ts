import { NextResponse } from 'next/server';

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const explicitRedirectUri = process.env.GOOGLE_REDIRECT_URI;

  // Calculate the actual redirect URI that will be used
  const effectiveAppUrl = appUrl || 'http://localhost:3000';
  const effectiveRedirectUri = explicitRedirectUri || `${effectiveAppUrl}/api/auth/google/callback`;

  return NextResponse.json({
    message: 'Add this EXACT redirect URI to Google Cloud Console',
    redirectUri: effectiveRedirectUri,
    debug: {
      NEXT_PUBLIC_APP_URL: appUrl || '(not set, using localhost:3000)',
      GOOGLE_REDIRECT_URI: explicitRedirectUri || '(not set, using computed value)',
      GOOGLE_CLIENT_ID: clientId ? `${clientId.substring(0, 20)}...` : '(not set)',
      GOOGLE_CLIENT_SECRET: clientSecret ? '(set)' : '(not set)',
    },
    instructions: [
      '1. Go to https://console.cloud.google.com/apis/credentials',
      '2. Click on your OAuth 2.0 Client ID',
      '3. Under "Authorized redirect URIs", add EXACTLY:',
      `   ${effectiveRedirectUri}`,
      '4. Make sure there are no trailing slashes or typos',
      '5. Click Save and wait 5 minutes for changes to propagate',
    ],
  });
}
