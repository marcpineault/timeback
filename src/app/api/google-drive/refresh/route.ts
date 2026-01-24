import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { refreshAccessToken } from '@/lib/googleDrive';

export async function POST(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { refreshToken } = await request.json();

    if (!refreshToken) {
      return NextResponse.json(
        { error: 'Missing refresh token' },
        { status: 400 }
      );
    }

    const credentials = await refreshAccessToken(refreshToken);

    return NextResponse.json({
      accessToken: credentials.access_token,
      expiryDate: credentials.expiry_date,
    });
  } catch (error) {
    console.error('[Google Drive] Refresh error:', error);
    return NextResponse.json(
      { error: 'Failed to refresh token' },
      { status: 401 }
    );
  }
}
