import { S3Client, GetObjectCommand, DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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

  console.log('[S3 Config] Checking S3 configuration...');
  console.log('[S3 Config] S3_ENDPOINT:', process.env.S3_ENDPOINT ? 'SET' : 'NOT SET');
  console.log('[S3 Config] S3_ACCESS_KEY_ID:', hasAccessKey ? 'SET' : 'NOT SET');
  console.log('[S3 Config] S3_SECRET_ACCESS_KEY:', hasSecretKey ? 'SET' : 'NOT SET');
  console.log('[S3 Config] S3_BUCKET:', process.env.S3_BUCKET || process.env.AWS_S3_BUCKET || 'NOT SET');
  console.log('[S3 Config] Result:', hasAccessKey && hasSecretKey && hasBucket ? 'CONFIGURED' : 'NOT CONFIGURED');

  return hasAccessKey && hasSecretKey && hasBucket;
}

export interface PresignedUploadUrl {
  url: string;
  key: string;
  method: 'PUT';
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

  // Generate a unique key for the file
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 15);
  const ext = filename.split('.').pop() || 'mp4';
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
 */
export async function getS3ObjectStream(key: string): Promise<NodeJS.ReadableStream> {
  const client = getS3Client();
  const bucket = getS3Bucket();

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const response = await client.send(command);

  if (!response.Body) {
    throw new Error('No body in S3 response');
  }

  return response.Body as NodeJS.ReadableStream;
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
