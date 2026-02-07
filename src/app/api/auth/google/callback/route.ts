import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { exchangeCodeForTokens, saveGoogleTokens } from '@/lib/google-drive';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    // SECURITY: Verify the authenticated user matches the state parameter
    // to prevent CSRF / account takeover attacks
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.redirect(
        new URL('/sign-in', request.url)
      );
    }

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

    // Look up the authenticated user's database record
    const authenticatedUser = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });

    if (!authenticatedUser) {
      console.error('Authenticated user not found in database:', clerkId);
      return NextResponse.redirect(
        new URL('/dashboard?google_error=user_not_found', request.url)
      );
    }

    // SECURITY: Verify the state parameter matches the authenticated user's ID
    // This prevents an attacker from substituting a victim's user ID in the state
    if (state !== authenticatedUser.id) {
      console.error('OAuth state mismatch: state does not match authenticated user', {
        stateUserId: state,
        authenticatedUserId: authenticatedUser.id,
      });
      return NextResponse.redirect(
        new URL('/dashboard?google_error=invalid_state', request.url)
      );
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);

    // Save tokens for the authenticated user
    await saveGoogleTokens(authenticatedUser.id, tokens);

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
