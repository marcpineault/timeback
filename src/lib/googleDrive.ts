import { google, drive_v3 } from 'googleapis';

// Google OAuth2 client singleton
let oauth2Client: InstanceType<typeof google.auth.OAuth2> | null = null;

export function getOAuth2Client() {
  if (!oauth2Client) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/google-drive/callback`;

    if (!clientId || !clientSecret) {
      throw new Error('Google OAuth credentials not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.');
    }

    oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }
  return oauth2Client;
}

export function isGoogleDriveConfigured(): boolean {
  const hasClientId = !!process.env.GOOGLE_CLIENT_ID;
  const hasClientSecret = !!process.env.GOOGLE_CLIENT_SECRET;
  return hasClientId && hasClientSecret;
}

/**
 * Generate OAuth2 authorization URL for Google Drive access
 */
export function getAuthUrl(state?: string): string {
  const client = getOAuth2Client();

  return client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/drive.file', // Only access files created by this app
    ],
    state,
    prompt: 'consent', // Always show consent screen to get refresh token
  });
}

/**
 * Exchange authorization code for tokens
 */
export async function getTokensFromCode(code: string) {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);
  return tokens;
}

/**
 * Get authenticated Drive client with provided tokens
 */
export function getDriveClient(accessToken: string): drive_v3.Drive {
  const client = getOAuth2Client();
  client.setCredentials({ access_token: accessToken });
  return google.drive({ version: 'v3', auth: client });
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string) {
  const client = getOAuth2Client();
  client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await client.refreshAccessToken();
  return credentials;
}

export interface UploadFileOptions {
  name: string;
  mimeType: string;
  data: Buffer | NodeJS.ReadableStream;
  folderId?: string;
}

export interface UploadResult {
  fileId: string;
  name: string;
  webViewLink?: string;
  webContentLink?: string;
}

/**
 * Upload a single file to Google Drive
 */
export async function uploadFileToDrive(
  accessToken: string,
  options: UploadFileOptions
): Promise<UploadResult> {
  const drive = getDriveClient(accessToken);

  const fileMetadata: drive_v3.Schema$File = {
    name: options.name,
    ...(options.folderId && { parents: [options.folderId] }),
  };

  const media = {
    mimeType: options.mimeType,
    body: options.data,
  };

  const response = await drive.files.create({
    requestBody: fileMetadata,
    media,
    fields: 'id, name, webViewLink, webContentLink',
  });

  return {
    fileId: response.data.id!,
    name: response.data.name!,
    webViewLink: response.data.webViewLink || undefined,
    webContentLink: response.data.webContentLink || undefined,
  };
}

export interface BulkUploadFile {
  name: string;
  mimeType: string;
  url: string; // URL to fetch the file from
}

export interface BulkUploadResult {
  successful: UploadResult[];
  failed: { name: string; error: string }[];
}

/**
 * Validate URL to prevent SSRF attacks
 * Blocks access to internal networks, localhost, and cloud metadata endpoints
 */
function isUrlSafeForFetch(url: string): { safe: boolean; reason?: string } {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    const protocol = urlObj.protocol;

    // Only allow HTTP and HTTPS
    if (protocol !== 'http:' && protocol !== 'https:') {
      return { safe: false, reason: 'Only HTTP and HTTPS protocols are allowed' };
    }

    // Block localhost variations
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]' ||
      hostname === '::1' ||
      hostname === '0.0.0.0'
    ) {
      return { safe: false, reason: 'Localhost URLs are not allowed' };
    }

    // Block private IP ranges (IPv4)
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const ipv4Match = hostname.match(ipv4Regex);
    if (ipv4Match) {
      const [, a, b, c] = ipv4Match.map(Number);
      // 10.0.0.0/8
      if (a === 10) {
        return { safe: false, reason: 'Private IP addresses are not allowed' };
      }
      // 172.16.0.0/12
      if (a === 172 && b >= 16 && b <= 31) {
        return { safe: false, reason: 'Private IP addresses are not allowed' };
      }
      // 192.168.0.0/16
      if (a === 192 && b === 168) {
        return { safe: false, reason: 'Private IP addresses are not allowed' };
      }
      // 169.254.0.0/16 (link-local, AWS metadata)
      if (a === 169 && b === 254) {
        return { safe: false, reason: 'Link-local and metadata endpoints are not allowed' };
      }
      // 127.0.0.0/8 (loopback)
      if (a === 127) {
        return { safe: false, reason: 'Loopback addresses are not allowed' };
      }
      // 0.0.0.0/8
      if (a === 0) {
        return { safe: false, reason: 'Invalid IP address' };
      }
    }

    // Block cloud metadata endpoints (common hostnames)
    const blockedHostnames = [
      'metadata.google.internal',
      'metadata.goog',
      'metadata',
      'instance-data',
    ];
    if (blockedHostnames.includes(hostname)) {
      return { safe: false, reason: 'Cloud metadata endpoints are not allowed' };
    }

    // Block internal DNS patterns
    if (
      hostname.endsWith('.internal') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.localdomain')
    ) {
      return { safe: false, reason: 'Internal hostnames are not allowed' };
    }

    return { safe: true };
  } catch {
    return { safe: false, reason: 'Invalid URL format' };
  }
}

/**
 * Bulk upload multiple files to Google Drive
 * Fetches files from URLs and uploads them in parallel (with concurrency limit)
 */
export async function bulkUploadToDrive(
  accessToken: string,
  files: BulkUploadFile[],
  folderId?: string,
  concurrency: number = 3
): Promise<BulkUploadResult> {
  const successful: UploadResult[] = [];
  const failed: { name: string; error: string }[] = [];

  // Process files in batches to limit concurrency
  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency);

    const batchResults = await Promise.allSettled(
      batch.map(async (file) => {
        // SSRF protection: validate URL before fetching
        const urlCheck = isUrlSafeForFetch(file.url);
        if (!urlCheck.safe) {
          throw new Error(`URL validation failed: ${urlCheck.reason}`);
        }

        // Fetch the file from the URL
        const response = await fetch(file.url);
        if (!response.ok) {
          throw new Error('Failed to fetch file');
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Upload to Google Drive
        return uploadFileToDrive(accessToken, {
          name: file.name,
          mimeType: file.mimeType,
          data: buffer,
          folderId,
        });
      })
    );

    // Process results
    batchResults.forEach((result, index) => {
      const file = batch[index];
      if (result.status === 'fulfilled') {
        successful.push(result.value);
      } else {
        failed.push({
          name: file.name,
          error: result.reason?.message || 'Unknown error',
        });
      }
    });
  }

  return { successful, failed };
}

/**
 * Create a folder in Google Drive
 */
export async function createDriveFolder(
  accessToken: string,
  folderName: string,
  parentFolderId?: string
): Promise<string> {
  const drive = getDriveClient(accessToken);

  const fileMetadata: drive_v3.Schema$File = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    ...(parentFolderId && { parents: [parentFolderId] }),
  };

  const response = await drive.files.create({
    requestBody: fileMetadata,
    fields: 'id',
  });

  return response.data.id!;
}

/**
 * List folders in Google Drive (for folder picker)
 */
export async function listDriveFolders(
  accessToken: string,
  parentId?: string
): Promise<{ id: string; name: string }[]> {
  const drive = getDriveClient(accessToken);

  const query = parentId
    ? `mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
    : `mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;

  const response = await drive.files.list({
    q: query,
    fields: 'files(id, name)',
    orderBy: 'name',
    pageSize: 100,
  });

  return (response.data.files || []).map((file) => ({
    id: file.id!,
    name: file.name!,
  }));
}
