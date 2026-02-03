'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  uploadVideo,
  initChunkedUpload,
  uploadChunkBinary,
  finalizeUpload,
  checkS3Available,
  getS3UploadUrl,
  confirmS3Upload,
  getBatchS3UploadUrls,
  confirmBatchS3Uploads,
  type FileInfo
} from '@/app/actions/upload';

export interface UploadedFile {
  fileId: string;
  filename: string;
  originalName: string;
  size: number;
  previewUrl?: string;
  s3Key?: string;
}

interface UploadingFile {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'complete' | 'error';
  error?: string;
  result?: UploadedFile;
  previewUrl: string;
  s3Key?: string;
  presignedUrl?: string;
}

interface VideoUploaderProps {
  onUploadComplete: (files: UploadedFile[]) => void;
  disabled?: boolean;
}

// 5MB chunks to stay well under Railway's 10MB limit
// Base64 encoding adds ~33% overhead, so actual data per request is ~3.75MB
const CHUNK_SIZE = 5 * 1024 * 1024;

// Concurrent uploads - browsers limit ~6 connections per domain
// Keep lower to avoid overwhelming connection pool and ensure responses come back
const MAX_CONCURRENT_UPLOADS_DESKTOP = 3;
const MAX_CONCURRENT_UPLOADS_MOBILE = 2;

// Retry configuration for failed uploads
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000; // 1 second, doubles each retry

// Simple upload timeout per file (based on size, calculated per-file)

// Get content type from file, with fallback based on extension
const getContentType = (file: File): string => {
  // If file has a valid content type, use it
  if (file.type && file.type.startsWith('video/')) {
    return file.type;
  }

  // Fallback based on extension (iOS can report empty MIME types)
  const ext = file.name.toLowerCase().split('.').pop();
  const mimeTypes: Record<string, string> = {
    'mp4': 'video/mp4',
    'mov': 'video/quicktime',
    'webm': 'video/webm',
    'avi': 'video/x-msvideo',
    'm4v': 'video/x-m4v',
    '3gp': 'video/3gpp',
    'mkv': 'video/x-matroska',
  };

  return mimeTypes[ext || ''] || 'video/mp4';
};

export default function VideoUploader({ onUploadComplete, disabled }: VideoUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [s3Available, setS3Available] = useState<boolean | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Ref to track upload status - avoids stale closure issues with useCallback
  // This ensures the guard check always sees current status, not stale state from old closures
  const isUploadingRef = useRef(false);

  const isUploading = uploadingFiles.some(f => f.status === 'uploading' || f.status === 'pending');

  // Get max concurrent uploads based on device type
  const getMaxConcurrentUploads = useCallback(() => {
    return isMobile ? MAX_CONCURRENT_UPLOADS_MOBILE : MAX_CONCURRENT_UPLOADS_DESKTOP;
  }, [isMobile]);

  // Helper function to delay for retry
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Check if S3 is available and detect mobile on mount
  useEffect(() => {
    checkS3Available()
      .then(setS3Available)
      .catch((err) => {
        console.error('[Upload] Failed to check S3 availability:', err);
        setS3Available(false);
      });
    // Detect mobile device
    const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    setIsMobile(mobile);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  // Chunked upload for large files using binary FormData (no base64 overhead)
  const uploadFileChunked = async (file: File, index: number, previewUrl: string): Promise<UploadedFile | null> => {
    setUploadingFiles(prev => prev.map((f, i) =>
      i === index ? { ...f, status: 'uploading' as const, progress: 0 } : f
    ));

    try {
      // Step 1: Initialize upload
      const initResult = await initChunkedUpload(file.name, file.size, file.type);
      if (!initResult.success || !initResult.uploadId) {
        throw new Error(initResult.error || 'Failed to initialize upload');
      }

      const uploadId = initResult.uploadId;
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

      // Step 2: Upload chunks using binary FormData (no base64 conversion)
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunkBlob = file.slice(start, end);

        // Use FormData with binary blob - no base64 overhead
        const formData = new FormData();
        formData.append('uploadId', uploadId);
        formData.append('chunkIndex', String(chunkIndex));
        formData.append('totalChunks', String(totalChunks));
        formData.append('chunk', chunkBlob, `chunk_${chunkIndex}`);

        const chunkResult = await uploadChunkBinary(formData);

        if (!chunkResult.success) {
          throw new Error(chunkResult.error || 'Failed to upload chunk');
        }

        // Update progress
        const progress = Math.round(((chunkIndex + 1) / totalChunks) * 100);
        setUploadingFiles(prev => prev.map((f, i) =>
          i === index ? { ...f, progress } : f
        ));
      }

      // Step 3: Finalize upload
      const finalResult = await finalizeUpload(uploadId);
      if (!finalResult.success) {
        throw new Error(finalResult.error || 'Failed to finalize upload');
      }

      const uploadedFile: UploadedFile = {
        fileId: finalResult.fileId!,
        filename: finalResult.filename!,
        originalName: finalResult.originalName!,
        size: finalResult.size!,
        previewUrl,
      };

      setUploadingFiles(prev => prev.map((f, i) =>
        i === index ? { ...f, status: 'complete' as const, progress: 100, result: uploadedFile } : f
      ));

      return uploadedFile;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Upload failed';
      setUploadingFiles(prev => prev.map((f, i) =>
        i === index ? { ...f, status: 'error' as const, error: errorMsg } : f
      ));
      return null;
    }
  };

  // Direct upload for small files (under 5MB)
  const uploadFileDirectly = async (file: File, index: number, previewUrl: string): Promise<UploadedFile | null> => {
    setUploadingFiles(prev => prev.map((f, i) =>
      i === index ? { ...f, status: 'uploading' as const, progress: 0 } : f
    ));

    const formData = new FormData();
    formData.append('video', file);

    try {
      const result = await uploadVideo(formData);

      if (!result.success) {
        throw new Error(result.error || 'Upload failed');
      }

      const uploadedFile: UploadedFile = {
        fileId: result.fileId!,
        filename: result.filename!,
        originalName: result.originalName!,
        size: result.size!,
        previewUrl,
      };

      setUploadingFiles(prev => prev.map((f, i) =>
        i === index ? { ...f, status: 'complete' as const, progress: 100, result: uploadedFile } : f
      ));

      return uploadedFile;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Upload failed';
      setUploadingFiles(prev => prev.map((f, i) =>
        i === index ? { ...f, status: 'error' as const, error: errorMsg } : f
      ));
      return null;
    }
  };

  // S3 direct upload - bypasses all server size limits
  const uploadFileToS3 = async (file: File, index: number, previewUrl: string): Promise<UploadedFile | null> => {
    setUploadingFiles(prev => prev.map((f, i) =>
      i === index ? { ...f, status: 'uploading' as const, progress: 0 } : f
    ));

    const contentType = getContentType(file);

    try {
      // Step 1: Get presigned URL from server
      const urlResult = await getS3UploadUrl(file.name, contentType, file.size);
      if (!urlResult.success || !urlResult.url || !urlResult.key) {
        throw new Error(urlResult.error || 'Failed to get upload URL');
      }

      // Step 2: Upload directly to R2/S3 using presigned PUT URL
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        // Set timeout based on file size - allow 30 seconds per MB, minimum 2 minutes
        // This accounts for slow mobile connections
        const timeoutMs = Math.max(120000, Math.ceil(file.size / (1024 * 1024)) * 30000);
        xhr.timeout = timeoutMs;

        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            setUploadingFiles(prev => prev.map((f, i) =>
              i === index ? { ...f, progress } : f
            ));
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText}`));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Network error during upload'));
        });

        xhr.addEventListener('timeout', () => {
          reject(new Error('Upload timed out. Please check your connection and try again.'));
        });

        xhr.open('PUT', urlResult.url!);
        xhr.setRequestHeader('Content-Type', contentType);
        xhr.send(file);
      });

      // Step 3: Confirm upload with server
      const confirmResult = await confirmS3Upload(urlResult.key, file.name, file.size);
      if (!confirmResult.success) {
        throw new Error(confirmResult.error || 'Failed to confirm upload');
      }

      const uploadedFile: UploadedFile = {
        fileId: confirmResult.fileId!,
        filename: confirmResult.filename!,
        originalName: confirmResult.originalName!,
        size: confirmResult.size!,
        s3Key: confirmResult.s3Key,
        previewUrl,
      };

      setUploadingFiles(prev => prev.map((f, i) =>
        i === index ? { ...f, status: 'complete' as const, progress: 100, result: uploadedFile } : f
      ));

      return uploadedFile;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Upload failed';
      setUploadingFiles(prev => prev.map((f, i) =>
        i === index ? { ...f, status: 'error' as const, error: errorMsg } : f
      ));
      return null;
    }
  };

  const uploadSingleFile = async (file: File, index: number, previewUrl: string): Promise<UploadedFile | null> => {
    // Check S3 availability at upload time if not yet determined
    let useS3 = s3Available;
    if (useS3 === null) {
      console.log('[Upload] S3 availability not yet determined, checking now...');
      useS3 = await checkS3Available();
      setS3Available(useS3);
    }

    console.log('[Upload] S3 available:', useS3);

    // Use S3 direct upload if available (best option - no size limits)
    if (useS3) {
      console.log('[Upload] Using S3 direct upload');
      return uploadFileToS3(file, index, previewUrl);
    }

    console.log('[Upload] S3 not available, using fallback');
    // Fallback: Use chunked upload for files over 5MB
    if (file.size > CHUNK_SIZE) {
      return uploadFileChunked(file, index, previewUrl);
    } else {
      return uploadFileDirectly(file, index, previewUrl);
    }
  };

  // Simple upload using XHR with progress tracking - no complex stall detection
  const uploadSingleFileToS3 = async (
    file: File,
    index: number,
    urlInfo: { url: string; key: string }
  ): Promise<{ index: number; s3Key: string } | null> => {
    const contentType = getContentType(file);
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);

    console.log(`[Upload] Starting upload for ${file.name} (${fileSizeMB}MB, type: ${contentType})`);

    // Set status to uploading
    setUploadingFiles(prev => prev.map((f, i) =>
      i === index ? { ...f, status: 'uploading' as const, progress: 0 } : f
    ));

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const retryDelay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`[Upload] Retry ${attempt}/${MAX_RETRIES} for ${file.name} after ${retryDelay}ms`);
        await delay(retryDelay);
        setUploadingFiles(prev => prev.map((f, i) =>
          i === index ? { ...f, progress: 0, error: undefined } : f
        ));
      }

      try {
        // Timeout: 30 seconds per MB, minimum 2 minutes
        const timeoutMs = Math.max(120000, Math.ceil(file.size / (1024 * 1024)) * 30000);

        const uploadResult = await new Promise<boolean>((resolve, reject) => {
          const xhr = new XMLHttpRequest();

          xhr.timeout = timeoutMs;

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const progress = Math.round((event.loaded / event.total) * 100);
              setUploadingFiles(prev => prev.map((f, i) =>
                i === index ? { ...f, progress } : f
              ));
            }
          };

          xhr.onload = () => {
            console.log(`[Upload] S3 responded for ${file.name}: status=${xhr.status}`);
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(true);
            } else {
              reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
            }
          };

          xhr.onerror = () => reject(new Error('Network error'));
          xhr.ontimeout = () => reject(new Error('Upload timed out'));

          xhr.open('PUT', urlInfo.url);
          xhr.setRequestHeader('Content-Type', contentType);
          xhr.send(file);
        });

        if (uploadResult) {
          console.log(`[Upload] Successfully uploaded ${file.name}`);
          setUploadingFiles(prev => prev.map((f, i) =>
            i === index ? { ...f, status: 'complete' as const, progress: 100 } : f
          ));
          return { index, s3Key: urlInfo.key };
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Upload failed';
        console.warn(`[Upload] Attempt ${attempt + 1} failed for ${file.name}: ${errorMsg}`);

        // Don't retry 4xx errors
        if (errorMsg.startsWith('HTTP 4')) {
          console.error(`[Upload] Client error, not retrying: ${errorMsg}`);
          break;
        }
      }
    }

    // All retries exhausted
    console.error(`[Upload] All retries exhausted for ${file.name}`);
    setUploadingFiles(prev => prev.map((f, i) =>
      i === index ? { ...f, status: 'error' as const, error: 'Upload failed after retries' } : f
    ));
    return null;
  };

  // Simple semaphore for concurrency control
  const createSemaphore = (limit: number) => {
    let running = 0;
    const queue: (() => void)[] = [];

    return {
      acquire: () => new Promise<void>((resolve) => {
        if (running < limit) {
          running++;
          resolve();
        } else {
          queue.push(resolve);
        }
      }),
      release: () => {
        running--;
        const next = queue.shift();
        if (next) {
          running++;
          next();
        }
      }
    };
  };

  // Simplified batch S3 upload - uses Promise.allSettled with semaphore for cleaner concurrency
  const uploadFilesToS3Batch = async (files: File[], initialState: UploadingFile[]): Promise<UploadedFile[]> => {
    console.log(`[Upload] Starting batch upload for ${files.length} files`);

    // Step 1: Get all presigned URLs in a single request
    const fileInfos: FileInfo[] = files.map(f => ({
      filename: f.name,
      contentType: getContentType(f),
      fileSize: f.size,
    }));

    console.log('[Upload] Requesting presigned URLs...');
    const batchUrlResult = await getBatchS3UploadUrls(fileInfos);
    if (!batchUrlResult.success || !batchUrlResult.urls) {
      console.error('[Upload] Failed to get presigned URLs:', batchUrlResult.error);
      throw new Error(batchUrlResult.error || 'Failed to get upload URLs');
    }

    console.log(`[Upload] Got ${batchUrlResult.urls.length} presigned URLs, starting uploads...`);

    // Step 2: Upload files with semaphore-controlled concurrency
    const maxConcurrent = getMaxConcurrentUploads();
    const semaphore = createSemaphore(maxConcurrent);

    const uploadPromises = files.map(async (file, index) => {
      const urlInfo = batchUrlResult.urls!.find(u => u.index === index);
      if (!urlInfo) {
        console.error(`[Upload] No URL info for file ${file.name} at index ${index}`);
        return null;
      }

      // Wait for a slot
      await semaphore.acquire();
      try {
        return await uploadSingleFileToS3(file, index, urlInfo);
      } finally {
        semaphore.release();
      }
    });

    // Wait for all uploads to complete (success or failure)
    const results = await Promise.allSettled(uploadPromises);

    const successfulUploads = results
      .map((r, i) => r.status === 'fulfilled' ? r.value : null)
      .filter((r): r is { index: number; s3Key: string } => r !== null);

    console.log(`[Upload] Uploads complete: ${successfulUploads.length}/${files.length} successful`);

    if (successfulUploads.length === 0) {
      console.warn('[Upload] No successful uploads to confirm');
      return [];
    }

    // Step 3: Confirm all uploads in a single request
    console.log('[Upload] Confirming batch uploads with server...');
    const confirmData = successfulUploads.map(u => ({
      s3Key: u.s3Key,
      originalName: files[u.index].name,
      size: files[u.index].size,
    }));

    const confirmResult = await confirmBatchS3Uploads(confirmData);
    if (!confirmResult.success || !confirmResult.files) {
      console.error('[Upload] Batch confirmation failed:', confirmResult.error);
      setUploadingFiles(prev => prev.map((f, i) => {
        const wasUploaded = successfulUploads.some(u => u.index === i);
        if (wasUploaded) {
          return { ...f, status: 'error' as const, error: 'Failed to confirm upload' };
        }
        return f;
      }));
      throw new Error('Failed to confirm uploads');
    }

    console.log(`[Upload] Batch confirmed ${confirmResult.files.length} files`);

    // Build results
    const uploadedFiles: UploadedFile[] = [];
    for (const confirmed of confirmResult.files) {
      const uploadInfo = successfulUploads.find(u => u.s3Key === confirmed.s3Key);
      if (uploadInfo && confirmed.success) {
        const uploadedFile: UploadedFile = {
          fileId: confirmed.fileId!,
          filename: confirmed.filename!,
          originalName: confirmed.originalName!,
          size: confirmed.size!,
          s3Key: confirmed.s3Key,
          previewUrl: initialState[uploadInfo.index].previewUrl,
        };
        uploadedFiles.push(uploadedFile);

        setUploadingFiles(prev => prev.map((f, i) =>
          i === uploadInfo.index ? { ...f, result: uploadedFile } : f
        ));
      }
    }

    return uploadedFiles;
  };

  // Check if a file is a valid video (handles iOS MIME type inconsistencies)
  const isValidVideoFile = (file: File): boolean => {
    // Known valid MIME types
    const validMimeTypes = [
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

    // Check MIME type first
    if (file.type && validMimeTypes.includes(file.type)) {
      return true;
    }

    // Fallback: Check file extension (iOS sometimes reports empty/wrong MIME types)
    const validExtensions = ['.mp4', '.mov', '.webm', '.avi', '.m4v', '.3gp', '.mkv'];
    const fileName = file.name.toLowerCase();
    if (validExtensions.some(ext => fileName.endsWith(ext))) {
      return true;
    }

    // Also accept any "video/*" MIME type
    if (file.type && file.type.startsWith('video/')) {
      return true;
    }

    return false;
  };

  const uploadFiles = async (files: File[]) => {
    // Prevent starting a new upload batch while one is in progress
    // Use ref instead of state to avoid stale closure issues with useCallback
    // State check would see old values due to handleFileSelect/handleDrop closures
    if (isUploadingRef.current) {
      console.warn('[Upload] Upload already in progress, ignoring new upload request');
      return;
    }

    // Mark uploads as in progress immediately using ref
    isUploadingRef.current = true;

    try {
      setError(null);
      setIsPreparing(true);

      // Small delay on mobile to show preparing state (iOS may have already processed, but gives visual feedback)
      if (isMobile) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Validate file types (with iOS-friendly fallback to extension check)
      const validFiles = files.filter(f => isValidVideoFile(f));
      setIsPreparing(false);

      if (validFiles.length === 0) {
        setError('No valid video files selected. Please upload MP4, MOV, WebM, or AVI files.');
        return;
      }

      if (validFiles.length < files.length) {
        setError(`${files.length - validFiles.length} file(s) skipped - invalid format.`);
      }

      // Initialize upload state with preview URLs
      const initialState: UploadingFile[] = validFiles.map(file => ({
        file,
        progress: 0,
        status: 'pending',
        previewUrl: URL.createObjectURL(file),
      }));
      setUploadingFiles(initialState);

      // Check S3 availability
      let useS3 = s3Available;
      if (useS3 === null) {
        useS3 = await checkS3Available();
        setS3Available(useS3);
      }

      let results: UploadedFile[] = [];

      // Use optimized batch upload for S3
      if (useS3) {
        console.log('[Upload] Using optimized batch S3 upload');
        try {
          results = await uploadFilesToS3Batch(validFiles, initialState);
        } catch (err) {
          console.error('[Upload] Batch upload failed:', err);
          setError(err instanceof Error ? err.message : 'Upload failed');
        }
      } else {
        // Fallback: Upload files using semaphore (same pattern as S3 batch)
        console.log('[Upload] Using fallback upload with semaphore');
        const maxConcurrent = getMaxConcurrentUploads();
        const semaphore = createSemaphore(maxConcurrent);

        const uploadPromises = validFiles.map(async (file, index) => {
          await semaphore.acquire();
          try {
            return await uploadSingleFile(file, index, initialState[index].previewUrl);
          } finally {
            semaphore.release();
          }
        });

        const allResults = await Promise.allSettled(uploadPromises);
        results = allResults
          .map(r => r.status === 'fulfilled' ? r.value : null)
          .filter((r): r is UploadedFile => r !== null);
      }

      // Notify parent of completed uploads
      if (results.length > 0) {
        onUploadComplete(results);
      }
    } finally {
      // Always reset state - even if an error occurred
      // This prevents uploads from getting permanently stuck
      setUploadingFiles([]);
      setIsPreparing(false);
      isUploadingRef.current = false;
      console.log('[Upload] Upload batch complete, state reset');
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      uploadFiles(files);
    }
  }, [disabled]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      uploadFiles(Array.from(files));
    }
    // Reset input so same file can be selected again if needed
    e.target.value = '';
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const completedCount = uploadingFiles.filter(f => f.status === 'complete').length;
  const totalCount = uploadingFiles.length;

  return (
    <div className="space-y-4">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed rounded-xl p-6 sm:p-12 text-center transition-all cursor-pointer
          ${isDragging
            ? 'border-violet-500 bg-violet-500/10'
            : 'border-gray-600 hover:border-gray-500 bg-[#1A1A24]/50'
          }
          ${isUploading || disabled || isPreparing ? 'pointer-events-none opacity-75' : ''}
        `}
      >
        <input
          type="file"
          accept="video/*,.mp4,.mov,.webm,.avi,.m4v"
          onChange={handleFileSelect}
          className="hidden"
          id="video-upload"
          disabled={isUploading || disabled || isPreparing}
          multiple
        />
        <label htmlFor="video-upload" className="cursor-pointer">
          <div className="flex flex-col items-center gap-3 sm:gap-4">
            {isPreparing ? (
              <>
                <div className="w-12 h-12 sm:w-16 sm:h-16 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-lg sm:text-xl text-gray-300">Preparing videos...</p>
                <p className="text-gray-500 text-sm sm:text-base">This may take a moment on mobile</p>
              </>
            ) : (
              <>
                <svg
                  className={`w-12 h-12 sm:w-16 sm:h-16 ${isDragging ? 'text-violet-500' : 'text-gray-500'}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>

                <p className="text-lg sm:text-xl text-gray-300">
                  {isDragging ? 'Drop your videos here' : 'Tap to upload videos'}
                </p>
                <p className="text-gray-500 text-sm sm:text-base">or drag and drop</p>
                <p className="text-xs sm:text-sm text-gray-600">MP4, MOV, WebM, AVI • Multiple files</p>
              </>
            )}
          </div>
        </label>
      </div>

      {/* Upload Progress List */}
      {uploadingFiles.length > 0 && (
        <div className="bg-[#1A1A24] rounded-xl p-4 space-y-3">
          <div className="flex justify-between items-center text-sm text-gray-400">
            <span>Uploading files</span>
            <span>{completedCount} / {totalCount} complete</span>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {uploadingFiles.map((item, index) => (
              <div key={index} className="flex items-center gap-3 p-2 bg-gray-700/50 rounded-lg">
                {/* Status Icon */}
                <div className="flex-shrink-0">
                  {item.status === 'complete' && (
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {item.status === 'error' && (
                    <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  {(item.status === 'uploading' || item.status === 'pending') && (
                    <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                  )}
                </div>

                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{item.file.name}</p>
                  <p className="text-xs text-gray-500">
                    {item.status === 'error' ? item.error : formatFileSize(item.file.size)}
                  </p>
                </div>

                {/* Progress Bar or Finalizing State */}
                {item.status === 'uploading' && (
                  <div className="flex items-center gap-2">
                    {item.progress === 100 ? (
                      <span className="text-xs text-violet-400 animate-pulse">Finalizing...</span>
                    ) : (
                      <>
                        <div className="w-20 bg-gray-600 rounded-full h-1.5">
                          <div
                            className="bg-violet-500 h-1.5 rounded-full transition-all"
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400 w-8">{item.progress}%</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
