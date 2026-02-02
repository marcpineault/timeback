import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getAuthUrl, isGoogleDriveConfigured } from '@/lib/googleDrive';

export async function GET(request: NextRequest) {
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
    // Check if picker scope is requested (for importing from Google Drive)
    const searchParams = request.nextUrl.searchParams;
    const includePickerScope = searchParams.get('scope') === 'picker';

    // Include userId in state for callback verification
    const state = Buffer.from(JSON.stringify({ userId })).toString('base64');
    const authUrl = getAuthUrl(state, includePickerScope);

    return NextResponse.json({ authUrl });
  } catch (error) {
    console.error('[Google Drive] Auth error:', error);
    return NextResponse.json(
      { error: 'Failed to generate auth URL' },
      { status: 500 }
    );
  }
}
