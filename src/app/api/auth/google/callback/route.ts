import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens, saveGoogleTokens } from '@/lib/google-drive';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state'); // This is the user ID
    const error = searchParams.get('error');

    if (error) {
      console.error('Google OAuth error:', error);
      return NextResponse.redirect(
        new URL('/dashboard?google_error=access_denied', request.url)
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL('/dashboard?google_error=missing_params', request.url)
      );
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);

    // Save tokens for the user
    await saveGoogleTokens(state, tokens);

    // Redirect back to dashboard with success message
    return NextResponse.redirect(
      new URL('/dashboard?google_connected=true', request.url)
    );
  } catch (error) {
    console.error('Google callback error:', error);
    return NextResponse.redirect(
      new URL('/dashboard?google_error=token_exchange_failed', request.url)
    );
  }
}
