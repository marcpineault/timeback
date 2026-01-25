import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getAuthUrl, isGoogleDriveConfigured, getRedirectUri } from '@/lib/googleDrive';

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isGoogleDriveConfigured()) {
    return NextResponse.json(
      { error: 'Google Drive is not configured' },
      { status: 503 }
    );
  }

  try {
    // Include userId in state for callback verification
    const state = Buffer.from(JSON.stringify({ userId })).toString('base64');
    const authUrl = getAuthUrl(state);
    const redirectUri = getRedirectUri();

    // Log the redirect URI for debugging OAuth issues
    console.log('[Google Drive] OAuth redirect URI:', redirectUri);

    return NextResponse.json({ authUrl, redirectUri });
  } catch (error) {
    console.error('[Google Drive] Auth error:', error);
    return NextResponse.json(
      { error: 'Failed to generate auth URL' },
      { status: 500 }
    );
  }
}
