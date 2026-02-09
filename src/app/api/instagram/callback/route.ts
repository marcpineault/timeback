import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exchangeCodeForLongLivedToken, discoverInstagramAccounts } from '@/lib/instagram';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      return NextResponse.redirect(
        new URL(`/dashboard/schedule?error=${encodeURIComponent(error)}`, request.url)
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL('/dashboard/schedule?error=missing_params', request.url)
      );
    }

    // Decode state to get clerkId
    let statePayload: { clerkId: string };
    try {
      statePayload = JSON.parse(Buffer.from(state, 'base64url').toString());
    } catch {
      return NextResponse.redirect(
        new URL('/dashboard/schedule?error=invalid_state', request.url)
      );
    }

    // Find user by clerkId
    const user = await prisma.user.findUnique({
      where: { clerkId: statePayload.clerkId },
    });

    if (!user) {
      return NextResponse.redirect(
        new URL('/dashboard/schedule?error=user_not_found', request.url)
      );
    }

    // Exchange code for long-lived token
    const { accessToken, expiresIn } = await exchangeCodeForLongLivedToken(code);

    // Discover Instagram Business accounts
    const igAccounts = await discoverInstagramAccounts(accessToken);

    if (igAccounts.length === 0) {
      return NextResponse.redirect(
        new URL('/dashboard/schedule?error=no_instagram_business_account', request.url)
      );
    }

    // Store each discovered account (upsert to handle reconnections)
    for (const ig of igAccounts) {
      await prisma.instagramAccount.upsert({
        where: { instagramUserId: ig.instagramUserId },
        create: {
          userId: user.id,
          instagramUserId: ig.instagramUserId,
          instagramUsername: ig.instagramUsername,
          instagramProfilePic: ig.instagramProfilePic,
          facebookPageId: ig.facebookPageId,
          facebookPageName: ig.facebookPageName,
          accessToken: ig.pageAccessToken,
          tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
          isActive: true,
        },
        update: {
          accessToken: ig.pageAccessToken,
          tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
          instagramUsername: ig.instagramUsername,
          instagramProfilePic: ig.instagramProfilePic,
          facebookPageName: ig.facebookPageName,
          isActive: true,
          lastError: null,
        },
      });
    }

    return NextResponse.redirect(
      new URL('/dashboard/schedule?connected=true', request.url)
    );
  } catch (error) {
    console.error('Instagram callback error:', error);
    return NextResponse.redirect(
      new URL('/dashboard/schedule?error=connection_failed', request.url)
    );
  }
}
