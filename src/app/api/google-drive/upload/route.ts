import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import {
  bulkUploadToDrive,
  createDriveFolder,
  refreshAccessToken,
  BulkUploadFile,
} from '@/lib/googleDrive';
import { isS3Configured, getProcessedVideoUrl } from '@/lib/s3';

interface UploadRequest {
  files: BulkUploadFile[];
  createFolder?: boolean;
  folderName?: string;
}

/**
 * Resolve video URLs by looking up in database and getting presigned S3 URLs
 * This bypasses the authenticated download endpoint for server-side access
 */
async function resolveVideoUrls(
  files: BulkUploadFile[],
  userId: string
): Promise<BulkUploadFile[]> {
  const resolvedFiles: BulkUploadFile[] = [];

  for (const file of files) {
    // Check if this is a relative download URL (our internal format)
    if (file.url.includes('/api/download/')) {
      // Extract filename from URL
      const urlMatch = file.url.match(/\/api\/download\/([^?]+)/);
      if (!urlMatch) {
        console.warn(`[Google Drive] Could not extract filename from URL: ${file.url}`);
        resolvedFiles.push(file);
        continue;
      }

      const filename = urlMatch[1];

      // Look up the video in the database to get the S3 key
      const video = await prisma.video.findFirst({
        where: {
          userId,
          OR: [
            { processedUrl: `/api/download/${filename}` },
            { processedUrl: { endsWith: filename } },
          ],
        },
        select: { processedUrl: true },
      });

      if (!video || !video.processedUrl) {
        console.warn(`[Google Drive] Video not found in database: ${filename}`);
        resolvedFiles.push(file);
        continue;
      }

      // Check if processedUrl is an S3 key
      const isS3Key = video.processedUrl.startsWith('processed/');

      if (isS3Key && isS3Configured()) {
        try {
          // Get presigned URL directly from S3
          const presignedUrl = await getProcessedVideoUrl(video.processedUrl);
          console.log(`[Google Drive] Resolved ${filename} to S3 presigned URL`);
          resolvedFiles.push({
            ...file,
            url: presignedUrl,
          });
          continue;
        } catch (error) {
          console.error(`[Google Drive] Failed to get presigned URL for ${filename}:`, error);
        }
      }
    }

    // Keep the original URL if we couldn't resolve it
    resolvedFiles.push(file);
  }

  return resolvedFiles;
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

    // Get tokens and user ID from database
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: {
        id: true, // Need internal ID for video lookup
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

    // Resolve internal download URLs to direct S3 presigned URLs
    // This is needed because server-side fetch can't access the authenticated download endpoint
    const resolvedFiles = await resolveVideoUrls(filesWithAbsoluteUrls, user.id);

    console.log(`[Google Drive] Resolved ${resolvedFiles.length} file URLs`);

    // Perform bulk upload with concurrency limit of 3
    // Pass the baseUrl as trusted origin to allow same-origin requests (for non-S3 URLs)
    const result = await bulkUploadToDrive(accessToken, resolvedFiles, folderId, 3, baseUrl);

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
