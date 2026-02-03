import { google, drive_v3 } from 'googleapis';
import { Readable } from 'stream';
import { getProcessedVideoUrl, isS3Configured } from './s3';

/**
 * Create a new OAuth2 client instance
 * Note: We create fresh instances for Drive operations to avoid race conditions
 * with multiple users accessing simultaneously
 */
export function createOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/google-drive/callback`;

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.');
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Get OAuth2 client for generating auth URLs and token operations
 * Uses a fresh instance each time to avoid credential conflicts
 */
export function getOAuth2Client() {
  return createOAuth2Client();
}

export function isGoogleDriveConfigured(): boolean {
  const hasClientId = !!process.env.GOOGLE_CLIENT_ID;
  const hasClientSecret = !!process.env.GOOGLE_CLIENT_SECRET;
  return hasClientId && hasClientSecret;
}

/**
 * Generate OAuth2 authorization URL for Google Drive access
 * @param state - Optional state parameter for CSRF protection
 * @param includePickerScope - If true, include drive.readonly scope for Google Picker
 */
export function getAuthUrl(state?: string, includePickerScope: boolean = false): string {
  const client = getOAuth2Client();

  const scopes = [
    'https://www.googleapis.com/auth/drive.file', // Access files created by this app
  ];

  // Add readonly scope for Google Picker (allows browsing user's Drive)
  if (includePickerScope) {
    scopes.push('https://www.googleapis.com/auth/drive.readonly');
  }

  return client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    state,
    prompt: 'consent', // Always show consent screen to get refresh token
  });
}

/**
 * Get the Google Client ID for use with Google Picker API
 */
export function getGoogleClientId(): string | undefined {
  return process.env.GOOGLE_CLIENT_ID;
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
 * Creates a fresh OAuth2 client to avoid race conditions with concurrent requests
 */
export function getDriveClient(accessToken: string): drive_v3.Drive {
  const client = createOAuth2Client();
  client.setCredentials({ access_token: accessToken });
  return google.drive({ version: 'v3', auth: client });
}

/**
 * Refresh access token using refresh token
 * Creates a fresh OAuth2 client to avoid race conditions
 */
export async function refreshAccessToken(refreshToken: string) {
  const client = createOAuth2Client();
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

  // Convert Buffer to readable stream - Google Drive API requires a stream
  const stream = Readable.from(options.data);

  const media = {
    mimeType: options.mimeType,
    body: stream,
  };

  try {
    const response = await drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: 'id, name, webViewLink, webContentLink',
    });

    if (!response.data.id) {
      throw new Error('No file ID returned from Google Drive');
    }

    return {
      fileId: response.data.id,
      name: response.data.name || options.name,
      webViewLink: response.data.webViewLink || undefined,
      webContentLink: response.data.webContentLink || undefined,
    };
  } catch (error) {
    // Handle specific Google Drive API errors
    if (error instanceof Error) {
      // Check for quota exceeded
      if (error.message.includes('quota') || error.message.includes('storageQuotaExceeded')) {
        throw new Error('Google Drive storage quota exceeded');
      }
      // Check for auth errors
      if (error.message.includes('invalid_grant') || error.message.includes('Token has been expired')) {
        throw new Error('Google Drive authorization expired');
      }
      // Check for permission errors
      if (error.message.includes('forbidden') || error.message.includes('accessNotConfigured')) {
        throw new Error('Google Drive access denied - please reconnect');
      }
    }
    throw error;
  }
}

export interface BulkUploadFile {
  name: string;
  mimeType: string;
  url: string; // URL to fetch the file from
  s3Key?: string; // Optional S3 key for just-in-time presigned URL generation
}

export interface BulkUploadResult {
  successful: UploadResult[];
  failed: { name: string; error: string }[];
}

/**
 * Validate URL to prevent SSRF attacks
 * Blocks access to internal networks, localhost, and cloud metadata endpoints
 * @param url - The URL to validate
 * @param trustedOrigin - Optional origin to trust (e.g., same-origin requests from the app itself)
 */
function isUrlSafeForFetch(url: string, trustedOrigin?: string): { safe: boolean; reason?: string } {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    const protocol = urlObj.protocol;

    // Only allow HTTP and HTTPS
    if (protocol !== 'http:' && protocol !== 'https:') {
      return { safe: false, reason: 'Only HTTP and HTTPS protocols are allowed' };
    }

    // Allow trusted origin (e.g., same-origin requests from the app itself)
    if (trustedOrigin) {
      const trustedUrl = new URL(trustedOrigin);
      if (urlObj.origin === trustedUrl.origin) {
        return { safe: true };
      }
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
 * @param accessToken - Google Drive access token
 * @param files - Array of files to upload
 * @param folderId - Optional folder ID to upload files to
 * @param concurrency - Number of concurrent uploads (default: 3)
 * @param trustedOrigin - Optional origin to trust for same-origin requests
 */
export async function bulkUploadToDrive(
  accessToken: string,
  files: BulkUploadFile[],
  folderId?: string,
  concurrency: number = 3,
  trustedOrigin?: string
): Promise<BulkUploadResult> {
  const successful: UploadResult[] = [];
  const failed: { name: string; error: string }[] = [];

  // Process files in batches to limit concurrency
  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency);

    const batchResults = await Promise.allSettled(
      batch.map(async (file) => {
        console.log(`[Google Drive] Processing file: ${file.name}`);

        // Generate presigned URL just-in-time if s3Key is provided
        // This prevents URL expiration issues when processing large batches
        let fetchUrl = file.url;
        if (file.s3Key && isS3Configured()) {
          try {
            console.log(`[Google Drive] Generating fresh presigned URL for ${file.name}`);
            fetchUrl = await getProcessedVideoUrl(file.s3Key);
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[Google Drive] Failed to generate presigned URL for ${file.name}: ${errorMsg}`);
            throw new Error(`Failed to generate S3 URL: ${errorMsg}`);
          }
        }

        // SSRF protection: validate URL before fetching
        const urlCheck = isUrlSafeForFetch(fetchUrl, trustedOrigin);
        if (!urlCheck.safe) {
          console.error(`[Google Drive] URL validation failed for ${file.name}: ${urlCheck.reason}`);
          throw new Error(`URL validation failed: ${urlCheck.reason}`);
        }

        // Fetch the file from the URL
        console.log(`[Google Drive] Fetching file from URL: ${fetchUrl.substring(0, 100)}...`);
        let response: Response;
        try {
          response = await fetch(fetchUrl, {
            // Longer timeout for large videos
            signal: AbortSignal.timeout(5 * 60 * 1000), // 5 minute timeout
          });
        } catch (fetchError) {
          const errorMessage = fetchError instanceof Error ? fetchError.message : 'Network error';
          console.error(`[Google Drive] Failed to fetch ${file.name}: ${errorMessage}`);
          throw new Error(`Failed to download file: ${errorMessage}`);
        }

        if (!response.ok) {
          console.error(`[Google Drive] Fetch failed for ${file.name}: HTTP ${response.status} ${response.statusText}`);
          throw new Error(`Failed to fetch file: HTTP ${response.status} ${response.statusText}`);
        }

        const contentLength = response.headers.get('content-length');
        console.log(`[Google Drive] Downloading ${file.name} (${contentLength ? `${Math.round(parseInt(contentLength) / 1024 / 1024)}MB` : 'unknown size'})`);

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        console.log(`[Google Drive] Uploading ${file.name} (${Math.round(buffer.length / 1024 / 1024)}MB) to Google Drive`);

        // Upload to Google Drive
        const result = await uploadFileToDrive(accessToken, {
          name: file.name,
          mimeType: file.mimeType,
          data: buffer,
          folderId,
        });

        console.log(`[Google Drive] Successfully uploaded ${file.name}, fileId: ${result.fileId}`);
        return result;
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
 * Supports pagination to retrieve all folders, not just the first 100
 */
export async function listDriveFolders(
  accessToken: string,
  parentId?: string,
  options?: { pageToken?: string; maxResults?: number }
): Promise<{
  folders: { id: string; name: string }[];
  nextPageToken?: string;
  hasMore: boolean;
}> {
  const drive = getDriveClient(accessToken);

  const query = parentId
    ? `mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
    : `mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;

  const response = await drive.files.list({
    q: query,
    fields: 'files(id, name), nextPageToken',
    orderBy: 'name',
    pageSize: Math.min(options?.maxResults || 100, 1000),
    pageToken: options?.pageToken,
  });

  const folders = (response.data.files || []).map((file) => ({
    id: file.id!,
    name: file.name!,
  }));

  return {
    folders,
    nextPageToken: response.data.nextPageToken || undefined,
    hasMore: !!response.data.nextPageToken,
  };
}

/**
 * List ALL folders in Google Drive (fetches all pages)
 * Use with caution for users with many folders - prefer paginated version
 */
export async function listAllDriveFolders(
  accessToken: string,
  parentId?: string
): Promise<{ id: string; name: string }[]> {
  const allFolders: { id: string; name: string }[] = [];
  let pageToken: string | undefined;

  do {
    const result = await listDriveFolders(accessToken, parentId, { pageToken });
    allFolders.push(...result.folders);
    pageToken = result.nextPageToken;
  } while (pageToken);

  return allFolders;
}

export interface DriveFileMetadata {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}

/**
 * Get file metadata from Google Drive
 */
export async function getFileMetadata(
  accessToken: string,
  fileId: string
): Promise<DriveFileMetadata> {
  const drive = getDriveClient(accessToken);

  const response = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType, size',
  });

  return {
    id: response.data.id!,
    name: response.data.name!,
    mimeType: response.data.mimeType!,
    size: parseInt(response.data.size || '0', 10),
  };
}

/**
 * Download a file from Google Drive
 * Returns a readable stream of the file content
 */
export async function downloadFileFromDrive(
  accessToken: string,
  fileId: string
): Promise<{ stream: NodeJS.ReadableStream; metadata: DriveFileMetadata }> {
  const drive = getDriveClient(accessToken);

  // Get file metadata first
  const metadata = await getFileMetadata(accessToken, fileId);

  // Download the file
  const response = await drive.files.get(
    {
      fileId,
      alt: 'media',
    },
    {
      responseType: 'stream',
    }
  );

  return {
    stream: response.data as NodeJS.ReadableStream,
    metadata,
  };
}

/**
 * Download a file from Google Drive as a Buffer
 */
export async function downloadFileAsBuffer(
  accessToken: string,
  fileId: string
): Promise<{ buffer: Buffer; metadata: DriveFileMetadata }> {
  const { stream, metadata } = await downloadFileFromDrive(accessToken, fileId);

  // Convert stream to buffer
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  const buffer = Buffer.concat(chunks);

  return { buffer, metadata };
}
