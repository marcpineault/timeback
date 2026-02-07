import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import {
  isGoogleDriveConfigured,
  refreshAccessToken,
  downloadFileAsBuffer,
} from '@/lib/googleDrive';
import { createUploadUrl, isS3Configured } from '@/lib/s3';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

interface ImportFileRequest {
  fileId: string;
  name: string;
  mimeType: string;
}

interface ImportResult {
  success: boolean;
  fileId?: string;
  filename?: string;
  originalName?: string;
  size?: number;
  s3Key?: string;
  error?: string;
}

export async function POST(request: NextRequest) {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isGoogleDriveConfigured()) {
    return NextResponse.json(
      { error: 'Google Drive is not configured' },
      { status: 503 }
    );
  }

  let body: { files: ImportFileRequest[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.files || !Array.isArray(body.files) || body.files.length === 0) {
    return NextResponse.json(
      { error: 'No files specified' },
      { status: 400 }
    );
  }

  // Limit number of files per request
  const maxFiles = 50;
  if (body.files.length > maxFiles) {
    return NextResponse.json(
      { error: `Maximum ${maxFiles} files per request` },
      { status: 400 }
    );
  }

  try {
    // Get user's Google Drive tokens
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: {
        googleDriveAccessToken: true,
        googleDriveRefreshToken: true,
        googleDriveTokenExpiry: true,
      },
    });

    if (!user?.googleDriveAccessToken) {
      return NextResponse.json(
        { error: 'Google Drive not connected' },
        { status: 401 }
      );
    }

    // Refresh token if expired
    let accessToken = user.googleDriveAccessToken;
    const tokenExpiry = user.googleDriveTokenExpiry;
    const isExpired = tokenExpiry && tokenExpiry < new Date(Date.now() + 5 * 60 * 1000);

    if (isExpired && user.googleDriveRefreshToken) {
      try {
        const newCredentials = await refreshAccessToken(user.googleDriveRefreshToken);
        if (newCredentials.access_token) {
          accessToken = newCredentials.access_token;
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
        console.error('[Google Drive Import] Token refresh failed:', refreshError);
        return NextResponse.json(
          { error: 'Google Drive session expired. Please reconnect.' },
          { status: 401 }
        );
      }
    }

    // Process files
    const results: ImportResult[] = [];
    const useS3 = isS3Configured();

    for (const file of body.files) {
      try {
        console.log(`[Google Drive Import] Downloading: ${file.name} (${file.fileId})`);

        // Download file from Google Drive
        const { buffer, metadata } = await downloadFileAsBuffer(accessToken, file.fileId);

        console.log(`[Google Drive Import] Downloaded: ${metadata.name} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);

        // Validate file size (1GB limit)
        const maxSize = 1024 * 1024 * 1024;
        if (buffer.length > maxSize) {
          results.push({
            success: false,
            originalName: file.name,
            error: 'File too large. Maximum size is 1GB.',
          });
          continue;
        }

        // Generate file ID and filename
        const fileId = uuidv4();
        const ext = (path.extname(file.name) || '.mp4').toLowerCase();
        // SECURITY: Validate file extension against allowed video types
        const allowedExtensions = ['.mp4', '.mov', '.webm', '.avi'];
        if (!allowedExtensions.includes(ext)) {
          results.push({
            success: false,
            originalName: file.name,
            error: `Unsupported file type: ${ext}. Allowed: ${allowedExtensions.join(', ')}`,
          });
          continue;
        }
        const filename = `${fileId}${ext}`;

        if (useS3) {
          // Upload to S3
          const { url, key } = await createUploadUrl(file.name, file.mimeType);

          // Upload the buffer to the presigned URL
          const uploadResponse = await fetch(url, {
            method: 'PUT',
            headers: {
              'Content-Type': file.mimeType,
            },
            body: new Uint8Array(buffer),
          });

          if (!uploadResponse.ok) {
            throw new Error(`S3 upload failed: ${uploadResponse.status}`);
          }

          console.log(`[Google Drive Import] Uploaded to S3: ${key}`);

          results.push({
            success: true,
            fileId,
            filename,
            originalName: file.name,
            size: buffer.length,
            s3Key: key,
          });
        } else {
          // Save to local storage
          const uploadsDir = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
          await mkdir(uploadsDir, { recursive: true });

          const filepath = path.join(uploadsDir, filename);
          await writeFile(filepath, buffer);

          console.log(`[Google Drive Import] Saved locally: ${filepath}`);

          results.push({
            success: true,
            fileId,
            filename,
            originalName: file.name,
            size: buffer.length,
          });
        }
      } catch (error) {
        console.error(`[Google Drive Import] Error importing ${file.name}:`, error);
        results.push({
          success: false,
          originalName: file.name,
          error: error instanceof Error ? error.message : 'Import failed',
        });
      }
    }

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    return NextResponse.json({
      totalImported: successful.length,
      totalFailed: failed.length,
      files: successful,
      failed: failed.map(f => ({
        name: f.originalName,
        error: f.error,
      })),
    });
  } catch (error) {
    console.error('[Google Drive Import] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Import failed' },
      { status: 500 }
    );
  }
}
