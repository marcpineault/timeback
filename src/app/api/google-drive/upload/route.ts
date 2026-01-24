import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
  bulkUploadToDrive,
  createDriveFolder,
  refreshAccessToken,
  BulkUploadFile,
} from '@/lib/googleDrive';

interface UploadRequest {
  accessToken: string;
  refreshToken?: string;
  files: BulkUploadFile[];
  createFolder?: boolean;
  folderName?: string;
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body: UploadRequest = await request.json();
    const { files, createFolder, folderName, refreshToken } = body;
    let { accessToken } = body;

    if (!accessToken || !files || files.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: accessToken and files' },
        { status: 400 }
      );
    }

    // Try to refresh token if we have a refresh token
    if (refreshToken) {
      try {
        const newCredentials = await refreshAccessToken(refreshToken);
        if (newCredentials.access_token) {
          accessToken = newCredentials.access_token;
        }
      } catch (refreshError) {
        console.log('[Google Drive] Token refresh failed, using existing token:', refreshError);
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

    console.log(`[Google Drive] Starting bulk upload of ${files.length} files for user ${userId}`);

    // Perform bulk upload with concurrency limit of 3
    const result = await bulkUploadToDrive(accessToken, files, folderId, 3);

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
