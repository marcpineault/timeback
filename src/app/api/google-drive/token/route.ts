import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { isGoogleDriveConfigured, refreshAccessToken } from '@/lib/googleDrive';

export async function GET() {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isGoogleDriveConfigured()) {
    return NextResponse.json(
      { error: 'Google Drive is not configured' },
      { status: 503 }
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: {
        googleDriveAccessToken: true,
        googleDriveRefreshToken: true,
        googleDriveTokenExpiry: true,
        googleDriveConnected: true,
      },
    });

    if (!user || !user.googleDriveAccessToken) {
      return NextResponse.json({
        connected: false,
        accessToken: null,
      });
    }

    // Check if token is expired and needs refresh
    const tokenExpiry = user.googleDriveTokenExpiry;
    const isExpired = tokenExpiry && tokenExpiry < new Date(Date.now() + 5 * 60 * 1000);

    let accessToken = user.googleDriveAccessToken;

    if (isExpired && user.googleDriveRefreshToken) {
      try {
        const newCredentials = await refreshAccessToken(user.googleDriveRefreshToken);
        if (newCredentials.access_token) {
          accessToken = newCredentials.access_token;
          // Update tokens in database
          await prisma.user.update({
            where: { clerkId },
            data: {
              googleDriveAccessToken: newCredentials.access_token,
              googleDriveTokenExpiry: newCredentials.expiry_date
                ? new Date(newCredentials.expiry_date)
                : null,
              googleDriveConnected: true,
            },
          });
        }
      } catch (refreshError) {
        console.error('[Google Drive] Token refresh failed:', refreshError);
        return NextResponse.json({
          connected: false,
          accessToken: null,
          needsReconnect: true,
        });
      }
    }

    return NextResponse.json({
      connected: true,
      accessToken,
    });
  } catch (error) {
    console.error('[Google Drive] Token fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to get access token' },
      { status: 500 }
    );
  }
}
