import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import {
  bulkUploadToDrive,
  createDriveFolder,
  refreshAccessToken,
  BulkUploadFile,
} from '@/lib/googleDrive';
import { isS3Configured } from '@/lib/s3';

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
): Promise<{ resolved: BulkUploadFile[]; errors: { name: string; error: string }[] }> {
  const resolved: BulkUploadFile[] = [];
  const errors: { name: string; error: string }[] = [];

  console.log(`[Google Drive] Resolving ${files.length} file URLs for user ${userId}`);
  console.log(`[Google Drive] S3 configured: ${isS3Configured()}`);

  for (const file of files) {
    console.log(`[Google Drive] Processing file: ${file.name}, URL: ${file.url.substring(0, 80)}...`);

    // Check if this is a relative download URL (our internal format)
    if (file.url.includes('/api/download/')) {
      // Extract filename from URL
      const urlMatch = file.url.match(/\/api\/download\/([^?]+)/);
      if (!urlMatch) {
        console.error(`[Google Drive] Could not extract filename from URL: ${file.url}`);
        errors.push({ name: file.name, error: 'Invalid download URL format' });
        continue;
      }

      const filename = urlMatch[1];
      console.log(`[Google Drive] Extracted filename: ${filename}`);

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

      console.log(`[Google Drive] Database lookup result:`, video);

      if (!video || !video.processedUrl) {
        console.error(`[Google Drive] Video not found in database for filename: ${filename}`);
        errors.push({ name: file.name, error: 'Video not found in database' });
        continue;
      }

      // Check if processedUrl is an S3 key
      const isS3Key = video.processedUrl.startsWith('processed/');
      console.log(`[Google Drive] processedUrl: ${video.processedUrl}, isS3Key: ${isS3Key}`);

      if (isS3Key && isS3Configured()) {
        // Pass the S3 key instead of pre-generating a presigned URL
        // The presigned URL will be generated just-in-time in bulkUploadToDrive
        // This prevents URL expiration issues when processing large batches
        console.log(`[Google Drive] Passing S3 key for ${filename} (URL will be generated just-in-time)`);
        resolved.push({
          ...file,
          url: file.url, // Keep original URL as fallback
          s3Key: video.processedUrl, // Pass S3 key for just-in-time URL generation
        });
        continue;
      } else if (!isS3Key) {
        // File is stored locally, not in S3 - this won't work for server-side fetch
        console.error(`[Google Drive] File ${filename} is stored locally, not in S3 - cannot fetch server-side`);
        errors.push({ name: file.name, error: 'File not available in cloud storage (stored locally)' });
        continue;
      } else if (!isS3Configured()) {
        console.error(`[Google Drive] S3 is not configured but file ${filename} requires it`);
        errors.push({ name: file.name, error: 'Cloud storage not configured' });
        continue;
      }
    } else {
      // URL is already absolute (external), keep as-is
      console.log(`[Google Drive] URL is already absolute: ${file.url.substring(0, 80)}...`);
      resolved.push(file);
    }
  }

  return { resolved, errors };
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
    const { resolved: resolvedFiles, errors: resolveErrors } = await resolveVideoUrls(filesWithAbsoluteUrls, user.id);

    console.log(`[Google Drive] Resolved ${resolvedFiles.length} file URLs, ${resolveErrors.length} errors`);

    // If all files failed to resolve, return early with errors
    if (resolvedFiles.length === 0 && resolveErrors.length > 0) {
      return NextResponse.json({
        success: false,
        folderId,
        uploaded: [],
        failed: resolveErrors,
        totalUploaded: 0,
        totalFailed: resolveErrors.length,
      });
    }

    // Perform bulk upload with concurrency limit of 3
    // Pass the baseUrl as trusted origin to allow same-origin requests (for non-S3 URLs)
    const result = await bulkUploadToDrive(accessToken, resolvedFiles, folderId, 3, baseUrl);

    // Combine resolve errors with upload errors
    const allFailed = [...resolveErrors, ...result.failed];

    console.log(
      `[Google Drive] Upload complete: ${result.successful.length} succeeded, ${allFailed.length} failed`
    );

    return NextResponse.json({
      success: result.successful.length > 0,
      folderId,
      uploaded: result.successful,
      failed: allFailed,
      totalUploaded: result.successful.length,
      totalFailed: allFailed.length,
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
