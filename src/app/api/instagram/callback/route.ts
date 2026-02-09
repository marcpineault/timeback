import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exchangeCodeForLongLivedToken, discoverInstagramAccounts } from '@/lib/instagram';

function redirectToSchedule(path: string): NextResponse {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://timebackvideo.com';
  return NextResponse.redirect(`${baseUrl}${path}`);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      return redirectToSchedule(`/dashboard/schedule?error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return redirectToSchedule('/dashboard/schedule?error=missing_params');
    }

    // Decode state to get clerkId
    let statePayload: { clerkId: string };
    try {
      statePayload = JSON.parse(Buffer.from(state, 'base64url').toString());
    } catch {
      return redirectToSchedule('/dashboard/schedule?error=invalid_state');
    }

    // Find user by clerkId
    const user = await prisma.user.findUnique({
      where: { clerkId: statePayload.clerkId },
    });

    if (!user) {
      return redirectToSchedule('/dashboard/schedule?error=user_not_found');
    }

    // Exchange code for long-lived token
    const { accessToken, expiresIn } = await exchangeCodeForLongLivedToken(code);

    // Discover Instagram Business accounts
    const igAccounts = await discoverInstagramAccounts(accessToken);

    if (igAccounts.length === 0) {
      return redirectToSchedule('/dashboard/schedule?error=no_instagram_business_account');
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

    return redirectToSchedule('/dashboard/schedule?connected=true');
  } catch (error) {
    console.error('Instagram callback error:', error);
    return redirectToSchedule('/dashboard/schedule?error=connection_failed');
  }
}
