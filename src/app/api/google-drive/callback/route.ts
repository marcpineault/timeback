import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getTokensFromCode } from '@/lib/googleDrive';

export async function GET(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
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
      if (stateData.userId !== userId) {
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

    // Encode tokens for URL (will be stored in localStorage on client)
    const tokenData = Buffer.from(
      JSON.stringify({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date,
      })
    ).toString('base64');

    return NextResponse.redirect(
      new URL(`/dashboard?gdrive_tokens=${tokenData}`, request.url)
    );
  } catch (error) {
    console.error('[Google Drive] Token exchange error:', error);
    return NextResponse.redirect(
      new URL('/dashboard?gdrive_error=token_exchange_failed', request.url)
    );
  }
}
