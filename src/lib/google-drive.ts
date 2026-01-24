import { google } from 'googleapis';
import { prisma } from './db';

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

// Create OAuth2 client
export function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`;

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured');
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// Generate auth URL for user to connect Google Drive
export function getAuthUrl(state: string): string {
  const oauth2Client = getOAuth2Client();

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    state,
    prompt: 'consent', // Force consent to always get refresh token
  });
}

// Exchange authorization code for tokens
export async function exchangeCodeForTokens(code: string) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

// Get authenticated Drive client for a user
export async function getDriveClient(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      googleDriveAccessToken: true,
      googleDriveRefreshToken: true,
      googleDriveTokenExpiry: true,
    },
  });

  if (!user?.googleDriveAccessToken || !user?.googleDriveRefreshToken) {
    throw new Error('Google Drive not connected');
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: user.googleDriveAccessToken,
    refresh_token: user.googleDriveRefreshToken,
    expiry_date: user.googleDriveTokenExpiry?.getTime(),
  });

  // Handle token refresh
  oauth2Client.on('tokens', async (tokens) => {
    await prisma.user.update({
      where: { id: userId },
      data: {
        googleDriveAccessToken: tokens.access_token || user.googleDriveAccessToken,
        googleDriveTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
      },
    });
  });

  return google.drive({ version: 'v3', auth: oauth2Client });
}

// Upload video to Google Drive
export async function uploadToDrive(
  userId: string,
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string = 'video/mp4'
): Promise<{ fileId: string; webViewLink: string }> {
  const drive = await getDriveClient(userId);

  // Create a readable stream from buffer
  const { Readable } = await import('stream');
  const stream = new Readable();
  stream.push(fileBuffer);
  stream.push(null);

  // Upload file
  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      mimeType,
    },
    media: {
      mimeType,
      body: stream,
    },
    fields: 'id,webViewLink',
  });

  if (!response.data.id) {
    throw new Error('Failed to upload file to Google Drive');
  }

  // Make file viewable by anyone with the link
  await drive.permissions.create({
    fileId: response.data.id,
    requestBody: {
      role: 'reader',
      type: 'anyone',
    },
  });

  return {
    fileId: response.data.id,
    webViewLink: response.data.webViewLink || `https://drive.google.com/file/d/${response.data.id}/view`,
  };
}

// Save tokens for a user
export async function saveGoogleTokens(
  userId: string,
  tokens: {
    access_token?: string | null;
    refresh_token?: string | null;
    expiry_date?: number | null;
  }
) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      googleDriveAccessToken: tokens.access_token || undefined,
      googleDriveRefreshToken: tokens.refresh_token || undefined,
      googleDriveTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
      googleDriveConnected: true,
    },
  });
}

// Disconnect Google Drive
export async function disconnectGoogleDrive(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      googleDriveAccessToken: null,
      googleDriveRefreshToken: null,
      googleDriveTokenExpiry: null,
      googleDriveConnected: false,
    },
  });
}

// Check if user has Google Drive connected
export async function isGoogleDriveConnected(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { googleDriveConnected: true },
  });
  return user?.googleDriveConnected || false;
}
