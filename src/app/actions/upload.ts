'use server'

import { mkdir, writeFile, appendFile, unlink, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { auth } from '@clerk/nextjs/server';
import { createUploadUrl, isS3Configured, initiateMultipartUpload, createPartUploadUrl, listUploadParts, completeMultipartS3Upload, abortMultipartS3Upload } from '@/lib/s3';

// Valid video MIME types - expanded for iOS compatibility
// iOS can report various MIME types for videos from the photo album
const VALID_VIDEO_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-msvideo',
  'video/x-m4v',
  'video/3gpp',
  'video/3gpp2',
  'video/hevc',        // iOS HEVC videos
  'video/x-matroska',  // MKV
];

const VALID_VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm', '.avi', '.m4v', '.3gp', '.mkv'];

// Check if a content type or filename represents a valid video
function isValidVideoType(contentType: string, filename?: string): boolean {
  // Check MIME type
  if (contentType && VALID_VIDEO_TYPES.includes(contentType)) {
    return true;
  }
  // Accept any video/* MIME type
  if (contentType && contentType.startsWith('video/')) {
    return true;
  }
  // Fallback to extension check (iOS can report empty/wrong MIME types)
  if (filename) {
    const lowerName = filename.toLowerCase();
    if (VALID_VIDEO_EXTENSIONS.some(ext => lowerName.endsWith(ext))) {
      return true;
    }
  }
  return false;
}

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

export interface MultipartInitResult {
  success: boolean;
  uploadId?: string;
  key?: string;
  partUrls?: Array<{ partNumber: number; url: string }>;
  error?: string;
}

export interface MultipartCompleteResult {
  success: boolean;
  fileId?: string;
  filename?: string;
  s3Key?: string;
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

    if (!isValidVideoType(contentType, filename)) {
      return {
        success: false,
        error: 'Invalid file type. Please upload MP4, MOV, WebM, or AVI.'
      };
    }

    const maxSize = 1024 * 1024 * 1024;
    if (fileSize > maxSize) {
      return {
        success: false,
        error: 'File too large. Maximum size is 1GB.'
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
 * Uses Promise.allSettled to handle partial failures gracefully
 * Optimized for desktop: generates all URLs in parallel for maximum speed
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

    const maxSize = 1024 * 1024 * 1024;

    // Validate all files first (fast, synchronous checks)
    for (const file of files) {
      if (!isValidVideoType(file.contentType, file.filename)) {
        return { success: false, error: `Invalid file type for ${file.filename}` };
      }
      if (file.fileSize > maxSize) {
        return { success: false, error: `File ${file.filename} too large. Maximum size is 1GB.` };
      }
    }

    // Generate all presigned URLs in parallel for maximum speed
    // Each createUploadUrl call is independent and lightweight
    const urlPromises = files.map(async (file, index) => {
      const { url, key } = await createUploadUrl(file.filename, file.contentType);
      return { url, key, index };
    });

    const results = await Promise.allSettled(urlPromises);

    const urls: Array<{ url: string; key: string; index: number }> = [];
    const errors: string[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        urls.push(result.value);
      } else {
        const filename = files[i].filename;
        const errorMsg = result.reason instanceof Error ? result.reason.message : 'Unknown error';
        errors.push(`${filename}: ${errorMsg}`);
        console.error(`[Upload] Failed to get URL for ${filename}:`, errorMsg);
      }
    }

    if (urls.length === 0) {
      console.error('[Upload] No presigned URLs could be generated');
      return { success: false, error: errors.join('; ') || 'Failed to generate any upload URLs' };
    }

    console.log(`[Upload] Generated ${urls.length}/${files.length} presigned URLs in parallel`);
    if (errors.length > 0) {
      console.warn(`[Upload] ${errors.length} files failed URL generation:`, errors);
    }

    return { success: true, urls };
  } catch (error) {
    console.error('Batch presigned URL error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to generate upload URLs';
    return { success: false, error: msg };
  }
}

/**
 * Confirm multiple S3 uploads in a single request
 * Optimized: processes all confirmations at once (no chunking needed for lightweight operations)
 */
export async function confirmBatchS3Uploads(
  uploads: Array<{ s3Key: string; originalName: string; size: number }>
): Promise<BatchConfirmResult> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: 'Unauthorized' };
    }

    // Process all confirmations at once - this is just string manipulation, very fast
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

/**
 * Initiate a multipart upload to S3/R2.
 * Returns the uploadId, key, and presigned URLs for each part.
 * Multipart uploads avoid the long finalization wait of single PUT because
 * R2 processes parts as they arrive.
 */
export async function initiateS3MultipartUpload(
  filename: string,
  contentType: string,
  fileSize: number,
  partSize: number = 10 * 1024 * 1024,
): Promise<MultipartInitResult> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!isS3Configured()) {
      return { success: false, error: 'S3 is not configured' };
    }

    if (!isValidVideoType(contentType, filename)) {
      return { success: false, error: 'Invalid file type. Please upload MP4, MOV, WebM, or AVI.' };
    }

    const maxSize = 1024 * 1024 * 1024;
    if (fileSize > maxSize) {
      return { success: false, error: 'File too large. Maximum size is 1GB.' };
    }

    const { uploadId, key } = await initiateMultipartUpload(filename, contentType);

    // Generate presigned URLs for all parts in parallel
    const totalParts = Math.ceil(fileSize / partSize);
    const urlPromises = Array.from({ length: totalParts }, (_, i) =>
      createPartUploadUrl(key, uploadId, i + 1).then(url => ({
        partNumber: i + 1,
        url,
      }))
    );

    const partUrls = await Promise.all(urlPromises);

    console.log(`[Upload] Initiated multipart upload: ${totalParts} parts for ${filename} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);

    return { success: true, uploadId, key, partUrls };
  } catch (error) {
    console.error('Initiate multipart upload error:', error);
    return { success: false, error: 'Failed to initiate multipart upload' };
  }
}

/**
 * Complete a multipart upload by listing parts (server-side, no CORS needed for ETags)
 * and assembling them.
 */
export async function completeS3MultipartUpload(
  key: string,
  uploadId: string,
): Promise<MultipartCompleteResult> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: 'Unauthorized' };
    }

    // List parts server-side to get ETags (avoids browser CORS issues)
    const parts = await listUploadParts(key, uploadId);
    if (parts.length === 0) {
      return { success: false, error: 'No parts found for multipart upload' };
    }

    // Complete the multipart upload
    await completeMultipartS3Upload(key, uploadId, parts);

    const filename = key.split('/').pop() || key;
    const fileId = filename.replace(/\.[^/.]+$/, '');

    console.log(`[Upload] Completed multipart upload: ${parts.length} parts for ${key}`);

    return { success: true, fileId, filename, s3Key: key };
  } catch (error) {
    console.error('Complete multipart upload error:', error);
    // Try to abort the upload to clean up
    try {
      await abortMultipartS3Upload(key, uploadId);
    } catch {
      // Ignore abort errors
    }
    return { success: false, error: 'Failed to complete multipart upload' };
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

    // Validate file type (with iOS-friendly extension fallback)
    if (!isValidVideoType(mimeType, originalName)) {
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

    if (!isValidVideoType(file.type, file.name)) {
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
