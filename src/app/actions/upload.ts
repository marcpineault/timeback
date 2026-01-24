'use server'

import { mkdir, writeFile, appendFile, unlink, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { auth } from '@clerk/nextjs/server';
import { createUploadUrl, isS3Configured } from '@/lib/s3';

export interface UploadResult {
  success: boolean;
  fileId?: string;
  filename?: string;
  originalName?: string;
  size?: number;
  s3Key?: string;
  error?: string;
}

export interface ChunkUploadResult {
  success: boolean;
  error?: string;
  progress?: number;
}

export interface InitUploadResult {
  success: boolean;
  uploadId?: string;
  error?: string;
}

export interface S3PresignedUrlResult {
  success: boolean;
  url?: string;
  key?: string;
  error?: string;
}

export interface S3UploadCompleteResult {
  success: boolean;
  fileId?: string;
  filename?: string;
  originalName?: string;
  size?: number;
  s3Key?: string;
  error?: string;
}

export interface FileInfo {
  filename: string;
  contentType: string;
  fileSize: number;
}

export interface BatchPresignedUrlResult {
  success: boolean;
  urls?: Array<{ url: string; key: string; index: number }>;
  error?: string;
}

export interface BatchConfirmResult {
  success: boolean;
  files?: Array<S3UploadCompleteResult>;
  error?: string;
}

/**
 * Check if S3 uploads are available
 */
export async function checkS3Available(): Promise<boolean> {
  const configured = isS3Configured();
  console.log(`[Upload] S3 configured: ${configured}`);
  return configured;
}

/**
 * Get a presigned URL for direct browser-to-S3 upload
 */
export async function getS3UploadUrl(
  filename: string,
  contentType: string,
  fileSize: number
): Promise<S3PresignedUrlResult> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!isS3Configured()) {
      return { success: false, error: 'S3 is not configured' };
    }

    const validTypes = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'];
    if (!validTypes.includes(contentType)) {
      return {
        success: false,
        error: 'Invalid file type. Please upload MP4, MOV, WebM, or AVI.'
      };
    }

    const maxSize = 500 * 1024 * 1024;
    if (fileSize > maxSize) {
      return {
        success: false,
        error: 'File too large. Maximum size is 500MB.'
      };
    }

    const { url, key } = await createUploadUrl(filename, contentType);

    console.log(`[Upload] Generated S3 presigned PUT URL`);

    return { success: true, url, key };
  } catch (error) {
    console.error('S3 presigned URL error:', error);
    return { success: false, error: 'Failed to generate upload URL' };
  }
}

/**
 * Confirm S3 upload completion
 */
export async function confirmS3Upload(
  s3Key: string,
  originalName: string,
  size: number
): Promise<S3UploadCompleteResult> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: 'Unauthorized' };
    }

    const filename = s3Key.split('/').pop() || s3Key;
    const fileId = filename.replace(/\.[^/.]+$/, '');

    console.log(`[Upload] S3 upload confirmed: ${originalName} (${(size / 1024 / 1024).toFixed(2)} MB)`);

    return {
      success: true,
      fileId,
      filename,
      originalName,
      size,
      s3Key,
    };
  } catch (error) {
    console.error('S3 confirm upload error:', error);
    return { success: false, error: 'Failed to confirm upload' };
  }
}

/**
 * Get presigned URLs for multiple files in a single request (reduces round trips)
 */
export async function getBatchS3UploadUrls(
  files: FileInfo[]
): Promise<BatchPresignedUrlResult> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!isS3Configured()) {
      return { success: false, error: 'S3 is not configured' };
    }

    const validTypes = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'];
    const maxSize = 500 * 1024 * 1024;

    const urls: Array<{ url: string; key: string; index: number }> = [];

    // Generate all presigned URLs in parallel
    const urlPromises = files.map(async (file, index) => {
      if (!validTypes.includes(file.contentType)) {
        throw new Error(`Invalid file type for ${file.filename}`);
      }
      if (file.fileSize > maxSize) {
        throw new Error(`File ${file.filename} too large. Maximum size is 500MB.`);
      }

      const { url, key } = await createUploadUrl(file.filename, file.contentType);
      return { url, key, index };
    });

    const results = await Promise.all(urlPromises);
    urls.push(...results);

    console.log(`[Upload] Generated ${urls.length} presigned URLs in batch`);

    return { success: true, urls };
  } catch (error) {
    console.error('Batch presigned URL error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to generate upload URLs';
    return { success: false, error: msg };
  }
}

/**
 * Confirm multiple S3 uploads in a single request
 */
export async function confirmBatchS3Uploads(
  uploads: Array<{ s3Key: string; originalName: string; size: number }>
): Promise<BatchConfirmResult> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: 'Unauthorized' };
    }

    const files: S3UploadCompleteResult[] = uploads.map(upload => {
      const filename = upload.s3Key.split('/').pop() || upload.s3Key;
      const fileId = filename.replace(/\.[^/.]+$/, '');

      return {
        success: true,
        fileId,
        filename,
        originalName: upload.originalName,
        size: upload.size,
        s3Key: upload.s3Key,
      };
    });

    console.log(`[Upload] Batch confirmed ${files.length} uploads to CLOUDFLARE R2`);

    return { success: true, files };
  } catch (error) {
    console.error('Batch confirm upload error:', error);
    return { success: false, error: 'Failed to confirm uploads' };
  }
}

// Initialize a chunked upload - creates the temp file
export async function initChunkedUpload(
  originalName: string,
  totalSize: number,
  mimeType: string
): Promise<InitUploadResult> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: 'Unauthorized' };
    }

    // Validate file type
    const validTypes = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'];
    if (!validTypes.includes(mimeType)) {
      return {
        success: false,
        error: 'Invalid file type. Please upload MP4, MOV, WebM, or AVI.'
      };
    }

    const uploadId = uuidv4();
    const uploadsDir = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
    const tempDir = path.join(uploadsDir, 'temp');

    await mkdir(tempDir, { recursive: true });

    // Create metadata file to track upload
    const metaPath = path.join(tempDir, `${uploadId}.meta`);
    await writeFile(metaPath, JSON.stringify({
      originalName,
      totalSize,
      mimeType,
      receivedBytes: 0,
      createdAt: Date.now()
    }));

    // Create empty file for chunks
    const chunkPath = path.join(tempDir, `${uploadId}.part`);
    await writeFile(chunkPath, Buffer.alloc(0));

    return { success: true, uploadId };
  } catch (error) {
    console.error('Init upload error:', error);
    return { success: false, error: 'Failed to initialize upload' };
  }
}

// Upload a single chunk using binary FormData (no base64 overhead)
export async function uploadChunkBinary(
  formData: FormData
): Promise<ChunkUploadResult> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: 'Unauthorized' };
    }

    const uploadId = formData.get('uploadId') as string;
    const chunkIndex = parseInt(formData.get('chunkIndex') as string, 10);
    const totalChunks = parseInt(formData.get('totalChunks') as string, 10);
    const chunkFile = formData.get('chunk') as File;

    if (!uploadId || !chunkFile || isNaN(chunkIndex) || isNaN(totalChunks)) {
      return { success: false, error: 'Invalid chunk data' };
    }

    const uploadsDir = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
    const tempDir = path.join(uploadsDir, 'temp');
    const chunkPath = path.join(tempDir, `${uploadId}.part`);
    const metaPath = path.join(tempDir, `${uploadId}.meta`);

    if (!existsSync(metaPath)) {
      return { success: false, error: 'Upload session not found' };
    }

    // Read binary data directly from File (no base64 conversion)
    const arrayBuffer = await chunkFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await appendFile(chunkPath, buffer);

    // Update metadata
    const meta = JSON.parse(await (await import('fs/promises')).readFile(metaPath, 'utf-8'));
    meta.receivedBytes += buffer.length;
    await writeFile(metaPath, JSON.stringify(meta));

    const progress = Math.round(((chunkIndex + 1) / totalChunks) * 100);

    return { success: true, progress };
  } catch (error) {
    console.error('Chunk upload error:', error);
    return { success: false, error: 'Failed to upload chunk' };
  }
}

// Legacy base64 chunk upload (kept for backwards compatibility)
export async function uploadChunk(
  uploadId: string,
  chunkIndex: number,
  totalChunks: number,
  chunkData: string // Base64 encoded chunk
): Promise<ChunkUploadResult> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: 'Unauthorized' };
    }

    const uploadsDir = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
    const tempDir = path.join(uploadsDir, 'temp');
    const chunkPath = path.join(tempDir, `${uploadId}.part`);
    const metaPath = path.join(tempDir, `${uploadId}.meta`);

    if (!existsSync(metaPath)) {
      return { success: false, error: 'Upload session not found' };
    }

    // Decode base64 chunk and append to file
    const buffer = Buffer.from(chunkData, 'base64');
    await appendFile(chunkPath, buffer);

    // Update metadata
    const meta = JSON.parse(await (await import('fs/promises')).readFile(metaPath, 'utf-8'));
    meta.receivedBytes += buffer.length;
    await writeFile(metaPath, JSON.stringify(meta));

    const progress = Math.round(((chunkIndex + 1) / totalChunks) * 100);

    return { success: true, progress };
  } catch (error) {
    console.error('Chunk upload error:', error);
    return { success: false, error: 'Failed to upload chunk' };
  }
}

// Finalize the upload - move temp file to final location
export async function finalizeUpload(uploadId: string): Promise<UploadResult> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: 'Unauthorized' };
    }

    const uploadsDir = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
    const tempDir = path.join(uploadsDir, 'temp');
    const chunkPath = path.join(tempDir, `${uploadId}.part`);
    const metaPath = path.join(tempDir, `${uploadId}.meta`);

    if (!existsSync(metaPath) || !existsSync(chunkPath)) {
      return { success: false, error: 'Upload session not found' };
    }

    // Read metadata
    const meta = JSON.parse(await (await import('fs/promises')).readFile(metaPath, 'utf-8'));

    // Verify file size matches
    const fileStats = await stat(chunkPath);
    if (fileStats.size !== meta.totalSize) {
      // Clean up
      await unlink(chunkPath).catch(() => {});
      await unlink(metaPath).catch(() => {});
      return {
        success: false,
        error: `File size mismatch: expected ${meta.totalSize}, got ${fileStats.size}`
      };
    }

    // Create final filename and move file
    const fileId = uploadId;
    const ext = path.extname(meta.originalName) || '.mp4';
    const filename = `${fileId}${ext}`;
    const finalPath = path.join(uploadsDir, filename);

    // Rename temp file to final location
    const { rename } = await import('fs/promises');
    await rename(chunkPath, finalPath);

    // Clean up metadata file
    await unlink(metaPath).catch(() => {});

    return {
      success: true,
      fileId,
      filename,
      originalName: meta.originalName,
      size: meta.totalSize,
    };
  } catch (error) {
    console.error('Finalize upload error:', error);
    return { success: false, error: 'Failed to finalize upload' };
  }
}

// Legacy single-file upload (kept for small files under 5MB)
export async function uploadVideo(formData: FormData): Promise<UploadResult> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: 'Unauthorized' };
    }

    const file = formData.get('video') as File | null;

    if (!file) {
      return { success: false, error: 'No file uploaded' };
    }

    // For files over 5MB, client should use chunked upload
    if (file.size > 5 * 1024 * 1024) {
      return {
        success: false,
        error: 'File too large for direct upload. Please use chunked upload.'
      };
    }

    const validTypes = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'];
    if (!validTypes.includes(file.type)) {
      return {
        success: false,
        error: 'Invalid file type. Please upload MP4, MOV, WebM, or AVI.'
      };
    }

    const fileId = uuidv4();
    const ext = path.extname(file.name) || '.mp4';
    const filename = `${fileId}${ext}`;

    const uploadsDir = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
    await mkdir(uploadsDir, { recursive: true });

    const filepath = path.join(uploadsDir, filename);
    const arrayBuffer = await file.arrayBuffer();
    await writeFile(filepath, Buffer.from(arrayBuffer));

    return {
      success: true,
      fileId,
      filename,
      originalName: file.name,
      size: file.size,
    };
  } catch (error) {
    console.error('Upload error:', error);
    return { success: false, error: 'Failed to upload file. Please try again.' };
  }
}
