import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import {
  bulkUploadToDrive,
  createDriveFolder,
  refreshAccessToken,
  BulkUploadFile,
} from '@/lib/googleDrive';

// Allow up to 10 minutes for bulk Google Drive uploads
export const maxDuration = 600;

interface UploadRequest {
  files: BulkUploadFile[];
  createFolder?: boolean;
  folderName?: string;
}

export async function POST(request: NextRequest) {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body: UploadRequest = await request.json();
    const { files, createFolder, folderName } = body;

    // Get the base URL from the request to convert relative URLs to absolute
    const baseUrl = request.nextUrl.origin;

    // Convert relative URLs to absolute URLs
    const filesWithAbsoluteUrls = files.map((file) => ({
      ...file,
      url: file.url.startsWith('/') ? `${baseUrl}${file.url}` : file.url,
    }));

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'Missing required field: files' },
        { status: 400 }
      );
    }

    // Get tokens from database
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: {
        googleDriveAccessToken: true,
        googleDriveRefreshToken: true,
        googleDriveTokenExpiry: true,
      },
    });

    if (!user || !user.googleDriveAccessToken) {
      return NextResponse.json(
        { error: 'Google Drive not connected. Please connect first.' },
        { status: 401 }
      );
    }

    let accessToken = user.googleDriveAccessToken;

    // Check if token needs refresh
    const tokenExpiry = user.googleDriveTokenExpiry;
    const isExpired = tokenExpiry && tokenExpiry < new Date(Date.now() + 5 * 60 * 1000);

    if (isExpired && user.googleDriveRefreshToken) {
      try {
        const newCredentials = await refreshAccessToken(user.googleDriveRefreshToken);
        if (newCredentials.access_token) {
          accessToken = newCredentials.access_token;

          // Update tokens in database
          await prisma.user.update({
            where: { clerkId },
            data: {
              googleDriveAccessToken: newCredentials.access_token,
              googleDriveTokenExpiry: newCredentials.expiry_date
                ? new Date(newCredentials.expiry_date)
                : null,
            },
          });
        }
      } catch (refreshError) {
        console.error('[Google Drive] Token refresh failed:', refreshError);
        return NextResponse.json(
          { error: 'Google Drive authorization expired. Please reconnect.' },
          { status: 401 }
        );
      }
    }

    let folderId: string | undefined;

    // Create a folder if requested
    if (createFolder && folderName) {
      try {
        folderId = await createDriveFolder(accessToken, folderName);
        console.log(`[Google Drive] Created folder: ${folderName} (${folderId})`);
      } catch (folderError) {
        console.error('[Google Drive] Failed to create folder:', folderError);
        // Continue without folder - files will go to root
      }
    }

    console.log(`[Google Drive] Starting bulk upload of ${filesWithAbsoluteUrls.length} files for user ${clerkId}`);

    // Perform bulk upload with concurrency limit of 3
    // Pass the baseUrl as trusted origin to allow same-origin requests
    const result = await bulkUploadToDrive(accessToken, filesWithAbsoluteUrls, folderId, 3, baseUrl);

    console.log(
      `[Google Drive] Upload complete: ${result.successful.length} succeeded, ${result.failed.length} failed`
    );

    return NextResponse.json({
      success: true,
      folderId,
      uploaded: result.successful,
      failed: result.failed,
      totalUploaded: result.successful.length,
      totalFailed: result.failed.length,
    });
  } catch (error) {
    console.error('[Google Drive] Upload error:', error);

    // Check for auth errors
    if (error instanceof Error && error.message.includes('invalid_grant')) {
      return NextResponse.json(
        { error: 'Google Drive authorization expired. Please reconnect.' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
