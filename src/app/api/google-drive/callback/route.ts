import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getTokensFromCode } from '@/lib/googleDrive';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    console.error('[Google Drive] OAuth error:', error);
    return NextResponse.redirect(
      new URL(`/dashboard?gdrive_error=${encodeURIComponent(error)}`, request.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/dashboard?gdrive_error=no_code', request.url)
    );
  }

  // Verify state contains the correct userId
  if (state) {
    try {
      const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
      if (stateData.userId !== clerkId) {
        return NextResponse.redirect(
          new URL('/dashboard?gdrive_error=invalid_state', request.url)
        );
      }
    } catch {
      // State parsing failed, but continue since we verified auth
    }
  }

  try {
    const tokens = await getTokensFromCode(code);

    // Save tokens to database
    await prisma.user.update({
      where: { clerkId },
      data: {
        googleDriveAccessToken: tokens.access_token,
        googleDriveRefreshToken: tokens.refresh_token,
        googleDriveTokenExpiry: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : null,
      },
    });

    console.log(`[Google Drive] Tokens saved for user ${clerkId}`);

    return NextResponse.redirect(
      new URL('/dashboard?gdrive_connected=true', request.url)
    );
  } catch (error) {
    console.error('[Google Drive] Token exchange error:', error);
    return NextResponse.redirect(
      new URL('/dashboard?gdrive_error=token_exchange_failed', request.url)
    );
  }
}
