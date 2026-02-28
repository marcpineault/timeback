/**
 * Instagram Research API
 *
 * Uses the Instagram Graph API to discover top-performing videos from
 * other creators and hashtags. Leverages the user's connected Instagram
 * Business/Creator account for API access.
 */

import { GRAPH_API_BASE, classifyFacebookError, getInstagramConfig } from './instagram';
import { logger } from './logger';

// ─── Types ───────────────────────────────────────────────────────────

export interface InstagramMedia {
  id: string;
  caption?: string;
  media_type: string;
  permalink: string;
  like_count?: number;
  comments_count?: number;
  timestamp?: string;
}

export interface CreatorInfo {
  username: string;
  name?: string;
  biography?: string;
  followers_count?: number;
  profile_picture_url?: string;
}

export interface CreatorLookupResult {
  creator: CreatorInfo;
  videos: InstagramMedia[];
}

export interface HashtagSearchResult {
  hashtag: string;
  videos: InstagramMedia[];
}

// ─── Creator Lookup (Business Discovery API) ─────────────────────────

/**
 * Look up a public Instagram Business/Creator account by username and
 * fetch their recent media. Filters for VIDEO (Reels) and sorts by
 * engagement (likes + comments).
 */
export async function lookupCreator(
  igUserId: string,
  accessToken: string,
  targetUsername: string
): Promise<CreatorLookupResult> {
  // Strip @ prefix if present
  const username = targetUsername.replace(/^@/, '').trim().toLowerCase();

  if (!username) {
    throw new Error('Please enter an Instagram username');
  }

  // Debug: log token type and permissions to diagnose code 10 errors
  try {
    const { appId, appSecret } = getInstagramConfig();
    const appAccessToken = `${appId}|${appSecret}`;
    const debugRes = await fetch(
      `${GRAPH_API_BASE}/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(appAccessToken)}`
    );
    if (debugRes.ok) {
      const debugData = await debugRes.json();
      logger.info('Business Discovery token debug', {
        type: debugData.data?.type,
        isValid: debugData.data?.is_valid,
        scopes: debugData.data?.scopes,
        appId: debugData.data?.app_id,
        expiresAt: debugData.data?.expires_at,
        granularScopes: debugData.data?.granular_scopes,
      });
    }
  } catch (e) {
    logger.warn('Failed to debug token for business discovery', { error: e });
  }

  const fields = [
    'username',
    'name',
    'biography',
    'followers_count',
    'profile_picture_url',
    'media.limit(50){id,caption,like_count,comments_count,media_type,permalink,timestamp}',
  ].join(',');

  const url = `${GRAPH_API_BASE}/${igUserId}?fields=business_discovery.username(${encodeURIComponent(username)}){${fields}}&access_token=${accessToken}`;

  const res = await fetch(url);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    logger.error('Business Discovery API failed', { error: err, username });

    // Specific error for non-business accounts or not found
    if (err.error?.code === 100 || err.error?.error_subcode === 2207013) {
      throw new Error(
        `Could not find @${username}. Make sure the account is public and is a Business or Creator account.`
      );
    }

    // Permission error - likely App Review or token type issue
    if (err.error?.code === 10) {
      throw new Error(
        'Unable to search other creators. Your Facebook App may need "instagram_basic" approved through App Review, or your Instagram connection needs to be refreshed. Try disconnecting and reconnecting your Instagram account.'
      );
    }

    const classification = classifyFacebookError(err);
    throw new Error(classification.userMessage);
  }

  const data = await res.json();
  const discovery = data.business_discovery;

  if (!discovery) {
    throw new Error(`Could not find @${username}. The account may not be a Business or Creator account.`);
  }

  const creator: CreatorInfo = {
    username: discovery.username,
    name: discovery.name,
    biography: discovery.biography,
    followers_count: discovery.followers_count,
    profile_picture_url: discovery.profile_picture_url,
  };

  // Filter for video content (Reels) and sort by engagement
  const allMedia: InstagramMedia[] = discovery.media?.data || [];
  const videos = allMedia
    .filter((m: InstagramMedia) => m.media_type === 'VIDEO')
    .sort((a: InstagramMedia, b: InstagramMedia) => {
      const engA = (a.like_count || 0) + (a.comments_count || 0);
      const engB = (b.like_count || 0) + (b.comments_count || 0);
      return engB - engA;
    })
    .slice(0, 10);

  logger.info('Creator lookup complete', {
    username,
    totalMedia: allMedia.length,
    videoCount: videos.length,
  });

  return { creator, videos };
}

// ─── Hashtag Search ──────────────────────────────────────────────────

/**
 * Search for top-performing videos by hashtag.
 *
 * Note: Instagram limits hashtag searches to 30 unique hashtags per
 * 7-day period per Instagram user.
 */
export async function searchHashtagTopMedia(
  igUserId: string,
  accessToken: string,
  hashtag: string
): Promise<HashtagSearchResult> {
  // Clean hashtag input
  const cleanTag = hashtag.replace(/^#/, '').trim().toLowerCase();

  if (!cleanTag) {
    throw new Error('Please enter a hashtag');
  }

  // Step 1: Get the hashtag ID
  const searchUrl = `${GRAPH_API_BASE}/ig_hashtag_search?q=${encodeURIComponent(cleanTag)}&user_id=${igUserId}&access_token=${accessToken}`;

  const searchRes = await fetch(searchUrl);

  if (!searchRes.ok) {
    const err = await searchRes.json().catch(() => ({}));
    logger.error('Hashtag search failed', { error: err, hashtag: cleanTag });

    const classification = classifyFacebookError(err);

    if (err.error?.code === 24) {
      throw new Error('You have reached the hashtag search limit (30 unique hashtags per 7 days). Try again later.');
    }

    throw new Error(classification.userMessage);
  }

  const searchData = await searchRes.json();
  const hashtagData = searchData.data?.[0];

  if (!hashtagData?.id) {
    throw new Error(`Hashtag #${cleanTag} not found`);
  }

  // Step 2: Get top media for this hashtag
  const mediaFields = 'id,caption,like_count,comments_count,media_type,permalink,timestamp';
  const topMediaUrl = `${GRAPH_API_BASE}/${hashtagData.id}/top_media?user_id=${igUserId}&fields=${mediaFields}&access_token=${accessToken}`;

  const mediaRes = await fetch(topMediaUrl);

  if (!mediaRes.ok) {
    const err = await mediaRes.json().catch(() => ({}));
    logger.error('Hashtag top media fetch failed', { error: err, hashtag: cleanTag });
    throw new Error('Failed to fetch top posts for this hashtag');
  }

  const mediaData = await mediaRes.json();
  const allMedia: InstagramMedia[] = mediaData.data || [];

  // Filter for video content and sort by engagement
  const videos = allMedia
    .filter((m: InstagramMedia) => m.media_type === 'VIDEO')
    .sort((a: InstagramMedia, b: InstagramMedia) => {
      const engA = (a.like_count || 0) + (a.comments_count || 0);
      const engB = (b.like_count || 0) + (b.comments_count || 0);
      return engB - engA;
    })
    .slice(0, 10);

  logger.info('Hashtag search complete', {
    hashtag: cleanTag,
    totalMedia: allMedia.length,
    videoCount: videos.length,
  });

  return { hashtag: cleanTag, videos };
}
