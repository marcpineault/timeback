/**
 * Instagram Graph API Helper
 *
 * Handles OAuth, token management, and content publishing
 * via the Instagram Graph API (Business/Creator accounts).
 */

import { prisma } from './db';
import { logger } from './logger';

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// ─── Configuration ──────────────────────────────────────────────────

export function getInstagramConfig() {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  const redirectUri =
    process.env.INSTAGRAM_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_APP_URL}/api/instagram/callback`;

  if (!appId || !appSecret) {
    throw new Error('Facebook App credentials not configured (FACEBOOK_APP_ID, FACEBOOK_APP_SECRET)');
  }

  return { appId, appSecret, redirectUri };
}

// ─── OAuth ──────────────────────────────────────────────────────────

/**
 * Generate the Facebook OAuth URL for Instagram Business account connection.
 */
export function getInstagramAuthUrl(state: string): string {
  const { appId, redirectUri } = getInstagramConfig();

  const scopes = [
    'instagram_basic',
    'instagram_content_publish',
    'pages_show_list',
    'pages_read_engagement',
  ].join(',');

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: scopes,
    response_type: 'code',
    state,
  });

  return `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth?${params.toString()}`;
}

/**
 * Exchange an OAuth authorization code for a short-lived token,
 * then exchange that for a long-lived token (~60 days).
 */
export async function exchangeCodeForLongLivedToken(code: string): Promise<{
  accessToken: string;
  expiresIn: number;
}> {
  const { appId, appSecret, redirectUri } = getInstagramConfig();

  // Step 1: Exchange code for short-lived token
  const shortLivedRes = await fetch(
    `${GRAPH_API_BASE}/oauth/access_token?` +
      new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: redirectUri,
        code,
      })
  );

  if (!shortLivedRes.ok) {
    const err = await shortLivedRes.json();
    logger.error('Failed to exchange code for short-lived token', err);
    throw new Error(err.error?.message || 'Failed to exchange authorization code');
  }

  const shortLivedData = await shortLivedRes.json();

  // Step 2: Exchange short-lived token for long-lived token
  const longLivedRes = await fetch(
    `${GRAPH_API_BASE}/oauth/access_token?` +
      new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: shortLivedData.access_token,
      })
  );

  if (!longLivedRes.ok) {
    const err = await longLivedRes.json();
    logger.error('Failed to exchange for long-lived token', err);
    throw new Error(err.error?.message || 'Failed to get long-lived token');
  }

  const longLivedData = await longLivedRes.json();

  return {
    accessToken: longLivedData.access_token,
    expiresIn: longLivedData.expires_in || 5184000, // Default 60 days
  };
}

/**
 * Refresh a long-lived token before it expires.
 * Long-lived tokens can be refreshed once per day, as long as they haven't expired.
 */
export async function refreshLongLivedToken(currentToken: string): Promise<{
  accessToken: string;
  expiresIn: number;
}> {
  const { appId, appSecret } = getInstagramConfig();

  const res = await fetch(
    `${GRAPH_API_BASE}/oauth/access_token?` +
      new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: currentToken,
      })
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || 'Failed to refresh token');
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in || 5184000,
  };
}

// ─── Account Discovery ──────────────────────────────────────────────

interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string };
}

interface InstagramBusinessAccount {
  instagramUserId: string;
  instagramUsername: string;
  instagramProfilePic: string | null;
  facebookPageId: string;
  facebookPageName: string;
  pageAccessToken: string;
}

export interface DiscoveryResult {
  accounts: InstagramBusinessAccount[];
  pagesFound: number;
  pageNames: string[];
  tokenScopes: string[];
}

/**
 * After OAuth, discover the user's Facebook Pages and their linked
 * Instagram Business/Creator accounts.
 */
export async function discoverInstagramAccounts(
  userAccessToken: string
): Promise<DiscoveryResult> {
  // Debug: check which permissions the token actually has
  let tokenScopes: string[] = [];
  try {
    const debugRes = await fetch(
      `${GRAPH_API_BASE}/debug_token?input_token=${userAccessToken}&access_token=${userAccessToken}`
    );
    if (debugRes.ok) {
      const debugData = await debugRes.json();
      tokenScopes = debugData.data?.scopes || [];
      logger.info('Token debug info', {
        scopes: tokenScopes,
        appId: debugData.data?.app_id,
        type: debugData.data?.type,
        isValid: debugData.data?.is_valid,
      });
    }
  } catch (e) {
    logger.warn('Failed to debug token', { error: e });
  }

  // Strategy 1: Get pages WITH instagram_business_account in a single call
  // This uses the user token which may have different permission behavior
  const pagesRes = await fetch(
    `${GRAPH_API_BASE}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,profile_picture_url}&access_token=${userAccessToken}`
  );

  if (!pagesRes.ok) {
    const err = await pagesRes.json();
    logger.error('Failed to fetch Facebook Pages', { error: err });
    throw new Error(err.error?.message || 'Failed to fetch Facebook Pages');
  }

  const pagesData = await pagesRes.json();
  const pages: FacebookPage[] = pagesData.data || [];

  logger.info('Facebook Pages discovered', {
    count: pages.length,
    pageNames: pages.map(p => p.name),
    rawResponse: JSON.stringify(pagesData),
  });

  if (pages.length === 0) {
    logger.warn('No Facebook Pages found — ensure pages_show_list permission is granted');
  }

  const accounts: InstagramBusinessAccount[] = [];

  for (const page of pages) {
    let igAccountId = page.instagram_business_account?.id;
    let igUsername = (page.instagram_business_account as Record<string, string>)?.username;
    let igProfilePic = (page.instagram_business_account as Record<string, string>)?.profile_picture_url || null;

    // Strategy 2: If not returned inline, query the page directly
    if (!igAccountId) {
      logger.info('No IG account in inline response, querying page directly', { pageId: page.id, pageName: page.name });

      const igRes = await fetch(
        `${GRAPH_API_BASE}/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
      );

      if (igRes.ok) {
        const igData = await igRes.json();
        logger.info('Page IG query response (page token)', { pageId: page.id, pageName: page.name, response: JSON.stringify(igData) });
        igAccountId = igData.instagram_business_account?.id;
      } else {
        const err = await igRes.json().catch(() => ({}));
        logger.warn('Page token query failed', { pageId: page.id, pageName: page.name, error: err });
      }
    }

    // Strategy 3: Try user token if page token didn't work
    if (!igAccountId) {
      const igRes2 = await fetch(
        `${GRAPH_API_BASE}/${page.id}?fields=instagram_business_account&access_token=${userAccessToken}`
      );

      if (igRes2.ok) {
        const igData2 = await igRes2.json();
        logger.info('Page IG query response (user token)', { pageId: page.id, pageName: page.name, response: JSON.stringify(igData2) });
        igAccountId = igData2.instagram_business_account?.id;
      } else {
        const err = await igRes2.json().catch(() => ({}));
        logger.warn('User token query also failed', { pageId: page.id, pageName: page.name, error: err });
      }
    }

    if (!igAccountId) {
      logger.info('Page has no linked Instagram Business account after all strategies', { pageId: page.id, pageName: page.name });
      continue;
    }

    // Fetch profile details if we didn't get them inline
    if (!igUsername) {
      const profileRes = await fetch(
        `${GRAPH_API_BASE}/${igAccountId}?fields=id,username,profile_picture_url&access_token=${page.access_token}`
      );

      if (profileRes.ok) {
        const profile = await profileRes.json();
        igUsername = profile.username;
        igProfilePic = profile.profile_picture_url || null;
      }
    }

    accounts.push({
      instagramUserId: igAccountId,
      instagramUsername: igUsername || 'unknown',
      instagramProfilePic: igProfilePic,
      facebookPageId: page.id,
      facebookPageName: page.name,
      pageAccessToken: page.access_token,
    });
  }

  return { accounts, pagesFound: pages.length, pageNames: pages.map(p => p.name), tokenScopes };
}

// ─── Content Publishing ─────────────────────────────────────────────

interface PublishReelParams {
  instagramUserId: string;
  accessToken: string;
  videoUrl: string;
  caption: string;
  coverUrl?: string;
}

interface PublishResult {
  containerId: string;
  mediaId: string;
  permalink: string;
}

/**
 * Publish a Reel to Instagram using the Content Publishing API.
 *
 * Flow:
 * 1. Create media container with video URL
 * 2. Poll until container is ready (FINISHED status)
 * 3. Publish the container
 */
export async function publishReel(params: PublishReelParams): Promise<PublishResult> {
  const { instagramUserId, accessToken, videoUrl, caption, coverUrl } = params;

  // Step 1: Create media container
  const containerBody: Record<string, string> = {
    media_type: 'REELS',
    video_url: videoUrl,
    caption,
    access_token: accessToken,
  };

  if (coverUrl) {
    containerBody.cover_url = coverUrl;
  }

  const containerRes = await fetch(`${GRAPH_API_BASE}/${instagramUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(containerBody),
  });

  if (!containerRes.ok) {
    const err = await containerRes.json();
    throw new Error(`Failed to create media container: ${err.error?.message || JSON.stringify(err)}`);
  }

  const containerData = await containerRes.json();
  const containerId = containerData.id;

  // Step 2: Poll for container to be ready
  const maxPollAttempts = 60; // 5 minutes at 5s intervals
  const pollInterval = 5000;

  for (let i = 0; i < maxPollAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    const statusRes = await fetch(
      `${GRAPH_API_BASE}/${containerId}?fields=status_code,status&access_token=${accessToken}`
    );

    if (!statusRes.ok) continue;

    const statusData = await statusRes.json();

    if (statusData.status_code === 'FINISHED') {
      break;
    }

    if (statusData.status_code === 'ERROR') {
      throw new Error(`Media container failed: ${statusData.status || 'Unknown error'}`);
    }

    if (i === maxPollAttempts - 1) {
      throw new Error('Media container timed out waiting for FINISHED status');
    }
  }

  // Step 3: Publish the container
  const publishRes = await fetch(`${GRAPH_API_BASE}/${instagramUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id: containerId,
      access_token: accessToken,
    }),
  });

  if (!publishRes.ok) {
    const err = await publishRes.json();
    throw new Error(`Failed to publish: ${err.error?.message || JSON.stringify(err)}`);
  }

  const publishData = await publishRes.json();
  const mediaId = publishData.id;

  // Get permalink
  let permalink = '';
  try {
    const mediaRes = await fetch(
      `${GRAPH_API_BASE}/${mediaId}?fields=permalink&access_token=${accessToken}`
    );
    if (mediaRes.ok) {
      const mediaData = await mediaRes.json();
      permalink = mediaData.permalink || '';
    }
  } catch {
    // Permalink is nice to have, not critical
  }

  return { containerId, mediaId, permalink };
}

// ─── Token Management ───────────────────────────────────────────────

/**
 * Get a valid access token for an Instagram account, refreshing if needed.
 */
export async function getValidToken(accountId: string): Promise<string> {
  const account = await prisma.instagramAccount.findUnique({
    where: { id: accountId },
  });

  if (!account) {
    throw new Error('Instagram account not found');
  }

  if (!account.isActive) {
    throw new Error('Instagram account is inactive');
  }

  // If token expires within 7 days, refresh it
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  if (account.tokenExpiresAt < sevenDaysFromNow) {
    try {
      const refreshed = await refreshLongLivedToken(account.accessToken);
      await prisma.instagramAccount.update({
        where: { id: accountId },
        data: {
          accessToken: refreshed.accessToken,
          tokenExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000),
        },
      });
      return refreshed.accessToken;
    } catch (error) {
      logger.error('Failed to refresh Instagram token', { accountId, error });
      // If refresh fails but token hasn't expired yet, use the existing one
      if (account.tokenExpiresAt > new Date()) {
        return account.accessToken;
      }
      // Mark account as inactive
      await prisma.instagramAccount.update({
        where: { id: accountId },
        data: { isActive: false, lastError: 'Token expired and refresh failed' },
      });
      throw new Error('Instagram token expired and could not be refreshed');
    }
  }

  return account.accessToken;
}
