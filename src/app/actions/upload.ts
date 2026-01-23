'use server'

import { mkdir, writeFile, appendFile, unlink, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { auth } from '@clerk/nextjs/server';

export interface UploadResult {
  success: boolean;
  fileId?: string;
  filename?: string;
  originalName?: string;
  size?: number;
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

// Upload a single chunk (max 5MB each to stay well under Railway's limit)
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `Failed to upload file: ${errorMessage}` };
  }
}
