import { S3Client, GetObjectCommand, DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomBytes } from 'crypto';
import { createReadStream } from 'fs';
import { Readable } from 'stream';
import { logger } from './logger';

// S3-compatible client singleton (works with AWS S3, Cloudflare R2, Backblaze B2, etc.)
let s3Client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!s3Client) {
    const region = process.env.S3_REGION || process.env.AWS_REGION || 'auto';
    const endpoint = process.env.S3_ENDPOINT; // For R2: https://<account_id>.r2.cloudflarestorage.com

    s3Client = new S3Client({
      region,
      endpoint,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || '',
      },
      // Retry configuration for transient failures
      maxAttempts: 3,
      // Request timeout: 5 minutes for large video files on slow connections
      requestHandler: {
        requestTimeout: 300000,
        httpsAgent: { timeout: 300000 },
      } as never, // Type assertion needed for SDK v3 config
    });
  }
  return s3Client;
}

export function getS3Bucket(): string {
  const bucket = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET;
  if (!bucket) {
    throw new Error('S3_BUCKET environment variable is not set');
  }
  return bucket;
}

export function isS3Configured(): boolean {
  const hasAccessKey = !!(process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID);
  const hasSecretKey = !!(process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY);
  const hasBucket = !!(process.env.S3_BUCKET || process.env.AWS_S3_BUCKET);
  const isConfigured = hasAccessKey && hasSecretKey && hasBucket;

  logger.debug('S3 configuration check', {
    hasEndpoint: !!process.env.S3_ENDPOINT,
    hasAccessKey,
    hasSecretKey,
    hasBucket,
    isConfigured,
  });

  return isConfigured;
}

export interface PresignedUploadUrl {
  url: string;
  key: string;
  method: 'PUT';
}

/**
 * Sanitize a filename to prevent path traversal and other attacks
 */
function sanitizeFilename(filename: string): string {
  // Extract just the filename without any path components
  const basename = filename.split(/[/\\]/).pop() || 'file';
  // Remove any remaining path traversal attempts and dangerous characters
  return basename
    .replace(/\.\./g, '')  // Remove path traversal
    .replace(/[<>:"|?*\x00-\x1f]/g, '')  // Remove invalid filename chars
    .trim();
}

/**
 * Validate and extract file extension
 */
function getValidExtension(filename: string): string {
  const sanitized = sanitizeFilename(filename);
  const parts = sanitized.split('.');
  if (parts.length < 2) return 'mp4';

  const ext = parts.pop()?.toLowerCase() || 'mp4';
  // Only allow known safe video/audio extensions
  const allowedExtensions = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'mp3', 'wav', 'm4a', 'aac'];
  return allowedExtensions.includes(ext) ? ext : 'mp4';
}

/**
 * Generate a presigned PUT URL for direct browser-to-R2/S3 uploads
 * This completely bypasses server size limits
 * Using PUT instead of POST for better R2 compatibility
 */
export async function createUploadUrl(
  filename: string,
  contentType: string,
): Promise<PresignedUploadUrl> {
  const client = getS3Client();
  const bucket = getS3Bucket();

  // Generate a unique key for the file using cryptographic randomness
  // Sanitize filename to prevent path traversal attacks
  const timestamp = Date.now();
  const randomId = randomBytes(16).toString('hex');
  const ext = getValidExtension(filename);
  const key = `uploads/${timestamp}-${randomId}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(client, command, { expiresIn: 3600 });

  return { url, key, method: 'PUT' };
}

/**
 * Get a readable stream for an S3 object
 * Returns a Node.js Readable stream compatible with archiver and other Node.js stream consumers
 * Includes retry logic for large file downloads
 */
export async function getS3ObjectStream(key: string): Promise<Readable> {
  const client = getS3Client();
  const bucket = getS3Bucket();

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  // Retry logic for transient failures (network issues, timeouts)
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.debug(`Downloading from S3 (attempt ${attempt}/${maxRetries})`, { key });
      const response = await client.send(command);

      if (!response.Body) {
        throw new Error('No body in S3 response');
      }

      // AWS SDK v3 returns a web ReadableStream, convert to Node.js Readable
      // The Body can be ReadableStream | Readable | Blob depending on environment
      const body = response.Body;

      // If it's already a Node.js Readable, return it
      if (body instanceof Readable) {
        return body;
      }

      // If it's a web ReadableStream, convert it to Node.js Readable
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyBody = body as any;
      if (typeof anyBody.getReader === 'function') {
        // It's a web ReadableStream
        return Readable.fromWeb(anyBody as import('stream/web').ReadableStream);
      }

      // Fallback: wrap in a Readable using SDK's transformToByteArray
      if (typeof anyBody.transformToByteArray === 'function') {
        const bytes = await anyBody.transformToByteArray();
        return Readable.from(Buffer.from(bytes));
      }

      // Last resort: try to iterate
      return Readable.from(anyBody);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.warn(`S3 download attempt ${attempt} failed`, { key, error: lastError.message });

      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Failed to download from S3 after retries');
}

/**
 * Delete a file from S3
 */
export async function deleteS3Object(key: string): Promise<void> {
  const client = getS3Client();
  const bucket = getS3Bucket();

  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  await client.send(command);
}

/**
 * Upload a processed video to S3/R2
 * Uses multipart upload for large files with streaming
 * @returns The S3 key for the uploaded file
 */
export async function uploadProcessedVideo(
  localPath: string,
  filename: string
): Promise<string> {
  const client = getS3Client();
  const bucket = getS3Bucket();

  // Generate a unique key in the processed/ prefix
  const timestamp = Date.now();
  const randomId = randomBytes(8).toString('hex');
  const sanitized = sanitizeFilename(filename);
  const key = `processed/${timestamp}-${randomId}-${sanitized}`;

  logger.info('Uploading processed video to R2', { key, localPath });

  // Use multipart upload for large files (streaming)
  const upload = new Upload({
    client,
    params: {
      Bucket: bucket,
      Key: key,
      Body: createReadStream(localPath),
      ContentType: 'video/mp4',
    },
    // Upload in 5MB chunks
    partSize: 5 * 1024 * 1024,
    // Allow up to 4 concurrent uploads
    queueSize: 4,
  });

  await upload.done();

  logger.info('Processed video uploaded to R2', { key });

  return key;
}

/**
 * Get a presigned URL for downloading a processed video from S3/R2
 * The URL expires after 1 hour
 */
export async function getProcessedVideoUrl(key: string): Promise<string> {
  const client = getS3Client();
  const bucket = getS3Bucket();

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  // URL expires in 1 hour
  const url = await getSignedUrl(client, command, { expiresIn: 3600 });

  logger.debug('Generated presigned URL for processed video', { key });

  return url;
}
