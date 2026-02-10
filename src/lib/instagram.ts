/**
 * Instagram Graph API Helper
 *
 * Handles OAuth, token management, and content publishing
 * via the Instagram Graph API (Business/Creator accounts).
 */

import { prisma } from './db';
import { logger } from './logger';

const GRAPH_API_VERSION = 'v21.0';
export const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

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
    auth_type: 'rerequest',
    state,
  });

  return `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth?${params.toString()}`;
}

/**
 * Exchange an OAuth authorization code for both short-lived and long-lived tokens.
 * Returns both so we can use the short-lived token for discovery (more reliable
 * with /me/accounts) and store the long-lived token for future use.
 */
export async function exchangeCodeForTokens(code: string): Promise<{
  shortLivedToken: string;
  longLivedToken: string;
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
  const shortLivedToken = shortLivedData.access_token;

  // Step 2: Exchange short-lived token for long-lived token
  const longLivedRes = await fetch(
    `${GRAPH_API_BASE}/oauth/access_token?` +
      new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: shortLivedToken,
      })
  );

  if (!longLivedRes.ok) {
    const err = await longLivedRes.json();
    logger.error('Failed to exchange for long-lived token', err);
    throw new Error(err.error?.message || 'Failed to get long-lived token');
  }

  const longLivedData = await longLivedRes.json();

  return {
    shortLivedToken,
    longLivedToken: longLivedData.access_token,
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
  granularPageIds: string[];
}

/**
 * After OAuth, discover the user's Facebook Pages and their linked
 * Instagram Business/Creator accounts.
 */
export async function discoverInstagramAccounts(
  userAccessToken: string
): Promise<DiscoveryResult> {
  // Debug: check which permissions the token actually has
  // Must use app access token (appId|appSecret) to get accurate debug info
  const { appId, appSecret } = getInstagramConfig();
  const appAccessToken = `${appId}|${appSecret}`;
  let tokenScopes: string[] = [];
  let granularPageIds: string[] = [];
  try {
    const debugRes = await fetch(
      `${GRAPH_API_BASE}/debug_token?input_token=${encodeURIComponent(userAccessToken)}&access_token=${encodeURIComponent(appAccessToken)}`
    );
    if (debugRes.ok) {
      const debugData = await debugRes.json();
      tokenScopes = debugData.data?.scopes || [];
      const granularScopes = debugData.data?.granular_scopes || [];
      logger.info('Token debug info', {
        scopes: tokenScopes,
        appId: debugData.data?.app_id,
        type: debugData.data?.type,
        isValid: debugData.data?.is_valid,
        expiresAt: debugData.data?.expires_at,
        granularScopes,
      });

      // Extract page IDs from granular_scopes as fallback for /me/accounts
      for (const gs of granularScopes) {
        if (gs.scope === 'pages_show_list' && Array.isArray(gs.target_ids)) {
          granularPageIds = gs.target_ids;
        }
      }
      if (granularPageIds.length > 0) {
        logger.info('Extracted page IDs from granular_scopes', { granularPageIds });
      }
    } else {
      const err = await debugRes.json().catch(() => ({}));
      logger.warn('debug_token failed', { error: err });
    }
  } catch (e) {
    logger.warn('Failed to debug token', { error: e });
  }

  // Get user's Facebook Pages (don't include instagram_business_account here —
  // requesting it as a nested field causes Facebook to filter out pages if the
  // token can't read that field)
  const pagesRes = await fetch(
    `${GRAPH_API_BASE}/me/accounts?fields=id,name,access_token&access_token=${userAccessToken}`
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
  });

  if (pages.length === 0) {
    logger.warn('No Facebook Pages found — ensure pages_show_list permission is granted');
  }

  const accounts: InstagramBusinessAccount[] = [];

  for (const page of pages) {
    // Query the page for its linked Instagram Business account
    const igRes = await fetch(
      `${GRAPH_API_BASE}/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
    );

    if (igRes.ok) {
      const igData = await igRes.json();
      logger.info('Page IG query (page token)', { pageId: page.id, pageName: page.name, response: JSON.stringify(igData) });
      const igAccountId = igData.instagram_business_account?.id;

      if (igAccountId) {
        const profileRes = await fetch(
          `${GRAPH_API_BASE}/${igAccountId}?fields=id,username,profile_picture_url&access_token=${page.access_token}`
        );
        if (profileRes.ok) {
          const profile = await profileRes.json();
          accounts.push({
            instagramUserId: profile.id,
            instagramUsername: profile.username,
            instagramProfilePic: profile.profile_picture_url || null,
            facebookPageId: page.id,
            facebookPageName: page.name,
            pageAccessToken: page.access_token,
          });
          continue;
        }
      }
    } else {
      const err = await igRes.json().catch(() => ({}));
      logger.warn('Page token query failed', { pageId: page.id, pageName: page.name, error: err });
    }

    // Fallback: try with user token instead of page token
    const igRes2 = await fetch(
      `${GRAPH_API_BASE}/${page.id}?fields=instagram_business_account&access_token=${userAccessToken}`
    );

    if (igRes2.ok) {
      const igData2 = await igRes2.json();
      logger.info('Page IG query (user token)', { pageId: page.id, pageName: page.name, response: JSON.stringify(igData2) });
      const igAccountId = igData2.instagram_business_account?.id;

      if (igAccountId) {
        const profileRes = await fetch(
          `${GRAPH_API_BASE}/${igAccountId}?fields=id,username,profile_picture_url&access_token=${userAccessToken}`
        );
        if (profileRes.ok) {
          const profile = await profileRes.json();
          accounts.push({
            instagramUserId: profile.id,
            instagramUsername: profile.username,
            instagramProfilePic: profile.profile_picture_url || null,
            facebookPageId: page.id,
            facebookPageName: page.name,
            pageAccessToken: page.access_token,
          });
          continue;
        }
      }
    } else {
      const err = await igRes2.json().catch(() => ({}));
      logger.warn('User token query also failed', { pageId: page.id, pageName: page.name, error: err });
    }

    logger.info('Page has no linked Instagram Business account', { pageId: page.id, pageName: page.name });
  }

  return { accounts, pagesFound: pages.length, pageNames: pages.map(p => p.name), tokenScopes, granularPageIds };
}

/**
 * Fallback discovery: query pages directly by ID (from granular_scopes).
 * Bypasses /me/accounts which can return empty with long-lived tokens.
 */
export async function discoverFromPageIds(
  userAccessToken: string,
  pageIds: string[]
): Promise<DiscoveryResult> {
  const accounts: InstagramBusinessAccount[] = [];
  const pageNames: string[] = [];

  for (const pageId of pageIds) {
    // Query page directly for its name, access token, and linked IG account
    const pageRes = await fetch(
      `${GRAPH_API_BASE}/${pageId}?fields=id,name,access_token,instagram_business_account{id,username,profile_picture_url}&access_token=${userAccessToken}`
    );

    if (!pageRes.ok) {
      const err = await pageRes.json().catch(() => ({}));
      logger.warn('Direct page query failed', { pageId, error: err });

      // Try without instagram_business_account nested field (in case it causes filtering)
      const pageRes2 = await fetch(
        `${GRAPH_API_BASE}/${pageId}?fields=id,name,access_token&access_token=${userAccessToken}`
      );
      if (pageRes2.ok) {
        const pageData2 = await pageRes2.json();
        pageNames.push(pageData2.name || pageId);
        logger.info('Direct page query (simple)', { pageId, response: JSON.stringify(pageData2) });

        // Now query IG separately
        const igRes = await fetch(
          `${GRAPH_API_BASE}/${pageId}?fields=instagram_business_account&access_token=${pageData2.access_token || userAccessToken}`
        );
        if (igRes.ok) {
          const igData = await igRes.json();
          logger.info('Direct page IG query', { pageId, response: JSON.stringify(igData) });
          const igAccountId = igData.instagram_business_account?.id;
          if (igAccountId) {
            const profileRes = await fetch(
              `${GRAPH_API_BASE}/${igAccountId}?fields=id,username,profile_picture_url&access_token=${pageData2.access_token || userAccessToken}`
            );
            if (profileRes.ok) {
              const profile = await profileRes.json();
              accounts.push({
                instagramUserId: profile.id,
                instagramUsername: profile.username,
                instagramProfilePic: profile.profile_picture_url || null,
                facebookPageId: pageId,
                facebookPageName: pageData2.name || pageId,
                pageAccessToken: pageData2.access_token || userAccessToken,
              });
            }
          }
        }
      }
      continue;
    }

    const pageData = await pageRes.json();
    pageNames.push(pageData.name || pageId);
    logger.info('Direct page query result', { pageId, response: JSON.stringify(pageData) });

    const igAccount = pageData.instagram_business_account;
    if (igAccount?.id) {
      accounts.push({
        instagramUserId: igAccount.id,
        instagramUsername: igAccount.username || 'unknown',
        instagramProfilePic: igAccount.profile_picture_url || null,
        facebookPageId: pageId,
        facebookPageName: pageData.name || pageId,
        pageAccessToken: pageData.access_token || userAccessToken,
      });
    }
  }

  logger.info('discoverFromPageIds result', { pagesQueried: pageIds.length, accountsFound: accounts.length });

  return {
    accounts,
    pagesFound: pageIds.length,
    pageNames,
    tokenScopes: [],
    granularPageIds: pageIds,
  };
}

// ─── Page Token Helpers ──────────────────────────────────────────────

/**
 * Fetch a fresh page access token for a specific Facebook Page using a user access token.
 * When called with a long-lived user token, the returned page token is never-expiring.
 */
export async function fetchPageToken(userAccessToken: string, pageId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${GRAPH_API_BASE}/${pageId}?fields=access_token&access_token=${userAccessToken}`
    );
    if (res.ok) {
      const data = await res.json();
      return data.access_token || null;
    }
    const err = await res.json().catch(() => ({}));
    logger.warn('Failed to fetch page token', { pageId, error: err });
    return null;
  } catch (e) {
    logger.warn('Error fetching page token', { pageId, error: e });
    return null;
  }
}

/**
 * Fetch page tokens for multiple pages using a long-lived user token.
 * Returns a map of facebookPageId -> never-expiring page access token.
 */
export async function fetchLongLivedPageTokens(
  longLivedUserToken: string
): Promise<Map<string, string>> {
  const tokenMap = new Map<string, string>();
  try {
    const pagesRes = await fetch(
      `${GRAPH_API_BASE}/me/accounts?fields=id,access_token&access_token=${longLivedUserToken}`
    );
    if (pagesRes.ok) {
      const pagesData = await pagesRes.json();
      for (const page of pagesData.data || []) {
        if (page.id && page.access_token) {
          tokenMap.set(page.id, page.access_token);
        }
      }
      logger.info('Fetched long-lived page tokens', { pageCount: tokenMap.size });
    } else {
      const err = await pagesRes.json().catch(() => ({}));
      logger.warn('Failed to fetch pages with long-lived token', { error: err });
    }
  } catch (e) {
    logger.warn('Error fetching long-lived page tokens', { error: e });
  }
  return tokenMap;
}

// ─── Facebook API Error Classification ──────────────────────────────

interface FacebookApiError {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

export interface FacebookErrorClassification {
  category: 'token_expired' | 'token_invalid' | 'permission_denied' | 'rate_limited' | 'media_error' | 'unknown';
  userMessage: string;
  shouldRetry: boolean;
  shouldDeactivateAccount: boolean;
}

export function classifyFacebookError(err: FacebookApiError): FacebookErrorClassification {
  const code = err.error?.code;
  const subcode = err.error?.error_subcode;
  const message = err.error?.message || '';

  // Token expired (code 190, subcode 463 = expired, 460 = password changed)
  if (code === 190) {
    if (subcode === 463 || subcode === 460) {
      return {
        category: 'token_expired',
        userMessage: 'Your Instagram connection has expired. Please reconnect your account.',
        shouldRetry: false,
        shouldDeactivateAccount: true,
      };
    }
    if (subcode === 458) {
      return {
        category: 'permission_denied',
        userMessage: 'Instagram permissions were revoked. Please reconnect with all required permissions.',
        shouldRetry: false,
        shouldDeactivateAccount: true,
      };
    }
    return {
      category: 'token_invalid',
      userMessage: 'Your Instagram authentication is invalid. Please reconnect your account.',
      shouldRetry: false,
      shouldDeactivateAccount: true,
    };
  }

  // Permission denied (code 10 = permission not granted, code 200 = permission error)
  if (code === 10 || code === 200) {
    return {
      category: 'permission_denied',
      userMessage: 'Instagram permissions are missing. Please reconnect with all required permissions.',
      shouldRetry: false,
      shouldDeactivateAccount: true,
    };
  }

  // Rate limited (code 4 = app-level, code 32 = user-level, code 613 = calls limit)
  if (code === 4 || code === 32 || code === 613) {
    return {
      category: 'rate_limited',
      userMessage: 'Instagram rate limit reached. Your post will be retried automatically.',
      shouldRetry: true,
      shouldDeactivateAccount: false,
    };
  }

  // Media-specific errors
  if (code === 36003 || message.toLowerCase().includes('media') || message.toLowerCase().includes('video')) {
    return {
      category: 'media_error',
      userMessage: `Instagram rejected the video: ${message}`,
      shouldRetry: false,
      shouldDeactivateAccount: false,
    };
  }

  return {
    category: 'unknown',
    userMessage: `Instagram API error: ${message || 'Unknown error'}`,
    shouldRetry: true,
    shouldDeactivateAccount: false,
  };
}

export class PublishError extends Error {
  classification: FacebookErrorClassification;
  constructor(message: string, classification: FacebookErrorClassification) {
    super(message);
    this.name = 'PublishError';
    this.classification = classification;
  }
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
    const classification = classifyFacebookError(err);
    logger.error('Failed to create media container', {
      error: err,
      classification: classification.category,
      fbtrace_id: err.error?.fbtrace_id,
    });
    throw new PublishError(
      `Failed to create media container: ${classification.userMessage}`,
      classification
    );
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
    const classification = classifyFacebookError(err);
    logger.error('Failed to publish media', {
      error: err,
      classification: classification.category,
      fbtrace_id: err.error?.fbtrace_id,
    });
    throw new PublishError(
      `Failed to publish: ${classification.userMessage}`,
      classification
    );
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
 *
 * Uses the long-lived userAccessToken (stored separately) for the fb_exchange_token
 * refresh call, then re-derives a fresh page token from the refreshed user token.
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
    // Need userAccessToken to refresh — legacy records without it must reconnect
    if (!account.userAccessToken) {
      logger.warn('No userAccessToken stored, cannot refresh. User must reconnect.', { accountId });
      if (account.tokenExpiresAt > new Date()) {
        return account.accessToken;
      }
      await prisma.instagramAccount.update({
        where: { id: accountId },
        data: { isActive: false, lastError: 'Please reconnect your Instagram account to continue publishing.' },
      });
      throw new Error('Instagram account needs reconnection (no user token stored)');
    }

    try {
      // Refresh the long-lived USER token (not the page token)
      const refreshed = await refreshLongLivedToken(account.userAccessToken);

      // Re-derive the page token from the refreshed user token
      const newPageToken = await fetchPageToken(refreshed.accessToken, account.facebookPageId);

      await prisma.instagramAccount.update({
        where: { id: accountId },
        data: {
          userAccessToken: refreshed.accessToken,
          accessToken: newPageToken || account.accessToken,
          tokenExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000),
          lastError: null,
        },
      });
      return newPageToken || account.accessToken;
    } catch (error) {
      logger.error('Failed to refresh Instagram token', { accountId, error });
      // If refresh fails but token hasn't expired yet, use the existing one
      if (account.tokenExpiresAt > new Date()) {
        return account.accessToken;
      }
      // Mark account as inactive
      await prisma.instagramAccount.update({
        where: { id: accountId },
        data: { isActive: false, lastError: 'Token expired and refresh failed. Please reconnect your account.' },
      });
      throw new Error('Instagram token expired and could not be refreshed');
    }
  }

  return account.accessToken;
}
