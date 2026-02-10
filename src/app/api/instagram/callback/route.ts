import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exchangeCodeForTokens, discoverInstagramAccounts, discoverFromPageIds, fetchLongLivedPageTokens } from '@/lib/instagram';
import { logger } from '@/lib/logger';

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

    // Exchange code for both short-lived and long-lived tokens
    const { shortLivedToken, longLivedToken, expiresIn } = await exchangeCodeForTokens(code);

    // Step 1: Try discovering with short-lived token first (more reliable with /me/accounts)
    let discovery = await discoverInstagramAccounts(shortLivedToken);

    // Step 2: If short-lived token returned 0 pages, try with long-lived token
    if (discovery.accounts.length === 0 && discovery.pagesFound === 0) {
      console.log('Short-lived token returned 0 pages, trying long-lived token...');
      const longLivedDiscovery = await discoverInstagramAccounts(longLivedToken);
      if (longLivedDiscovery.accounts.length > 0 || longLivedDiscovery.pagesFound > 0) {
        discovery = longLivedDiscovery;
      }
    }

    // Step 3: If still no accounts and we have page IDs from granular_scopes, query directly
    if (discovery.accounts.length === 0 && discovery.granularPageIds.length > 0) {
      console.log('Falling back to granular_scopes page IDs:', discovery.granularPageIds);
      const directDiscovery = await discoverFromPageIds(longLivedToken, discovery.granularPageIds);
      if (directDiscovery.accounts.length > 0) {
        discovery = directDiscovery;
      }
    }

    const { accounts: igAccounts, pagesFound, pageNames, tokenScopes } = discovery;

    if (igAccounts.length === 0) {
      if (!tokenScopes.includes('pages_show_list') || !tokenScopes.includes('pages_read_engagement')) {
        return redirectToSchedule('/dashboard/schedule?error=missing_page_permissions');
      }
      if (!tokenScopes.includes('instagram_basic')) {
        return redirectToSchedule('/dashboard/schedule?error=missing_instagram_permissions');
      }
      if (pagesFound === 0) {
        return redirectToSchedule('/dashboard/schedule?error=no_facebook_pages');
      }
      const pagesParam = encodeURIComponent(pageNames.join(', '));
      return redirectToSchedule(`/dashboard/schedule?error=no_instagram_business_account&pages=${pagesParam}`);
    }

    // Re-fetch page tokens using the long-lived user token to get never-expiring page tokens.
    // Discovery may have used the short-lived token (more reliable for /me/accounts),
    // which returns short-lived page tokens (~1 hour). Page tokens obtained via a
    // long-lived user token are never-expiring for pages where the user has a permanent role.
    const longLivedPageTokens = await fetchLongLivedPageTokens(longLivedToken);

    // Store each discovered account with proper tokens
    for (const ig of igAccounts) {
      // Prefer the never-expiring page token from the long-lived user token request
      const pageToken = longLivedPageTokens.get(ig.facebookPageId) || ig.pageAccessToken;

      if (longLivedPageTokens.has(ig.facebookPageId)) {
        logger.info('Using long-lived page token for account', {
          instagramUsername: ig.instagramUsername,
          facebookPageId: ig.facebookPageId,
        });
      } else {
        logger.warn('Could not get long-lived page token, using discovery token (may be short-lived)', {
          instagramUsername: ig.instagramUsername,
          facebookPageId: ig.facebookPageId,
        });
      }

      await prisma.instagramAccount.upsert({
        where: { instagramUserId: ig.instagramUserId },
        create: {
          userId: user.id,
          instagramUserId: ig.instagramUserId,
          instagramUsername: ig.instagramUsername,
          instagramProfilePic: ig.instagramProfilePic,
          facebookPageId: ig.facebookPageId,
          facebookPageName: ig.facebookPageName,
          accessToken: pageToken,
          userAccessToken: longLivedToken,
          tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
          isActive: true,
        },
        update: {
          accessToken: pageToken,
          userAccessToken: longLivedToken,
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
