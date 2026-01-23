'use server'

import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { auth } from '@clerk/nextjs/server';

export interface UploadResult {
  success: boolean;
  fileId?: string;
  filename?: string;
  originalName?: string;
  size?: number;
  error?: string;
}

export async function uploadVideo(formData: FormData): Promise<UploadResult> {
  try {
    // Auth check
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: 'Unauthorized' };
    }

    const file = formData.get('video') as File | null;

    if (!file) {
      return { success: false, error: 'No file uploaded' };
    }

    // Validate file type
    const validTypes = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'];
    if (!validTypes.includes(file.type)) {
      return {
        success: false,
        error: 'Invalid file type. Please upload MP4, MOV, WebM, or AVI.'
      };
    }

    // Create unique filename
    const fileId = uuidv4();
    const ext = path.extname(file.name) || '.mp4';
    const filename = `${fileId}${ext}`;

    // Ensure uploads directory exists
    const uploadsDir = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
    await mkdir(uploadsDir, { recursive: true });

    // Save file using streaming to handle large files
    const filepath = path.join(uploadsDir, filename);

    // Convert File to stream and pipe to file system
    const fileStream = file.stream();
    const writeStream = createWriteStream(filepath);

    // Use pipeline for proper stream handling
    await pipeline(
      Readable.fromWeb(fileStream as import('stream/web').ReadableStream),
      writeStream
    );

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
