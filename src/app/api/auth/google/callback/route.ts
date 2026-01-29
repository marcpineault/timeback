import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens, saveGoogleTokens } from '@/lib/google-drive';
import { prisma } from '@/lib/db';

/**
 * Validate that a string is a valid UUID v4 format
 */
function isValidUUID(str: string): boolean {
  const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  // Also accept cuid format used by Prisma
  const cuidRegex = /^c[a-z0-9]{24}$/i;
  return uuidV4Regex.test(str) || cuidRegex.test(str);
}

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

    // Validate state is a valid user ID format to prevent injection attacks
    if (!isValidUUID(state)) {
      console.error('Invalid state parameter format:', state);
      return NextResponse.redirect(
        new URL('/dashboard?google_error=invalid_state', request.url)
      );
    }

    // Verify the user exists before saving tokens
    const userExists = await prisma.user.findUnique({
      where: { id: state },
      select: { id: true },
    });

    if (!userExists) {
      console.error('User not found for state:', state);
      return NextResponse.redirect(
        new URL('/dashboard?google_error=user_not_found', request.url)
      );
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);

    // Save tokens for the user (now validated)
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
