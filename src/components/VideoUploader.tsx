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
  initiateS3MultipartUpload,
  completeS3MultipartUpload,
  abortS3MultipartUpload,
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
  onUploadComplete: (files: UploadedFile[], autoProcess?: boolean) => void;
  disabled?: boolean;
  showAutoProcessOption?: boolean;
  /** Number of videos the user has processed (for showing contextual help) */
  videosProcessed?: number;
}

// 5MB chunks to stay well under Railway's 10MB limit
// Base64 encoding adds ~33% overhead, so actual data per request is ~3.75MB
const CHUNK_SIZE = 5 * 1024 * 1024;

// Concurrent uploads - too many concurrent large video uploads saturate bandwidth,
// causing each upload to crawl and triggering false stall detections + retries.
// 2 concurrent uploads balances parallelism with per-upload throughput on both platforms.
const MAX_CONCURRENT_UPLOADS_DESKTOP = 2;
const MIN_CONCURRENT_UPLOADS_DESKTOP = 1; // Floor for adaptive concurrency
const MAX_CONCURRENT_UPLOADS_MOBILE = 2;

// Retry configuration for failed uploads
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 500; // 500ms initial, doubles each retry (faster recovery)

// Stall detection
const STALL_CHECK_INTERVAL_MS = 10000; // Check every 10 seconds
const STALL_TIMEOUT_MS = 60000; // 60 seconds no progress = stalled

// Multipart upload - avoids long "Finalizing..." wait on R2 for large files.
// R2 processes each part as it arrives, so the final "complete" call is near-instant.
const MULTIPART_THRESHOLD = 10 * 1024 * 1024; // 10MB - use multipart for files above this
const MULTIPART_PART_SIZE = 10 * 1024 * 1024; // 10MB parts

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

export default function VideoUploader({ onUploadComplete, disabled, showAutoProcessOption = false, videosProcessed = 999 }: VideoUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [s3Available, setS3Available] = useState<boolean | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [autoProcessEnabled, setAutoProcessEnabled] = useState(false);
  const [autoProcessLoading, setAutoProcessLoading] = useState(true);
  const [hasSavedSettings, setHasSavedSettings] = useState(true);
  const [showAutoProcessTooltip, setShowAutoProcessTooltip] = useState(false);

  // Ref to track upload status - avoids stale closure issues with useCallback
  // This ensures the guard check always sees current status, not stale state from old closures
  const isUploadingRef = useRef(false);

  // Ref to hold the latest uploadFiles function - solves stale closure issue
  // Callbacks can use this ref to always call the current version of uploadFiles
  const uploadFilesRef = useRef<(files: File[]) => Promise<void>>(null!);

  const isUploading = uploadingFiles.some(f => f.status === 'uploading' || f.status === 'pending');

  // Get max concurrent uploads based on device type
  const getMaxConcurrentUploads = useCallback(() => {
    return isMobile ? MAX_CONCURRENT_UPLOADS_MOBILE : MAX_CONCURRENT_UPLOADS_DESKTOP;
  }, [isMobile]);

  // Helper function to delay for retry
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Reset upload state on mount and cleanup on unmount
  useEffect(() => {
    // Force reset on mount (handles page refresh and navigation)
    console.log('[Upload] Component mounted, resetting upload state');
    isUploadingRef.current = false;

    return () => {
      // Cleanup on unmount
      console.log('[Upload] Component unmounting, cleaning up');
      isUploadingRef.current = false;
    };
  }, []);

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

  // Load auto-process preference if option is shown
  useEffect(() => {
    if (!showAutoProcessOption) {
      setAutoProcessLoading(false);
      return;
    }

    // Load from localStorage first for instant display
    try {
      const saved = localStorage.getItem('timeback_auto_process');
      if (saved) {
        setAutoProcessEnabled(JSON.parse(saved));
      }
    } catch {
      // localStorage not available
    }

    // Then load from server
    fetch('/api/user/preferences')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.preferences) {
          setAutoProcessEnabled(data.preferences.autoProcessOnUpload);
          // Check if user has saved any processing preferences beyond defaults
          const prefs = data.preferences;
          const hasCustomized = prefs.captionStyle || prefs.silenceThreshold !== undefined || prefs.aspectRatio;
          setHasSavedSettings(!!hasCustomized);
        } else {
          setHasSavedSettings(false);
        }
      })
      .catch(() => {
        // Use localStorage value
      })
      .finally(() => setAutoProcessLoading(false));
  }, [showAutoProcessOption]);

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

        xhr.addEventListener('abort', () => {
          reject(new Error('Upload was aborted'));
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
          let lastProgressTime = Date.now();
          let stallCheckInterval: ReturnType<typeof setInterval> | null = null;
          let isSettled = false;

          const cleanup = () => {
            if (stallCheckInterval) {
              clearInterval(stallCheckInterval);
              stallCheckInterval = null;
            }
          };

          const settle = (fn: () => void) => {
            if (!isSettled) {
              isSettled = true;
              cleanup();
              fn();
            }
          };

          xhr.timeout = timeoutMs;

          // Track when browser finishes sending all bytes to the network layer.
          // After this point, we're just waiting for S3 to process and respond —
          // stall detection must NOT abort during this phase.
          let uploadSendComplete = false;

          xhr.upload.onprogress = (event) => {
            lastProgressTime = Date.now(); // Reset stall timer on progress
            if (event.lengthComputable) {
              const progress = Math.round((event.loaded / event.total) * 100);
              setUploadingFiles(prev => prev.map((f, i) =>
                i === index ? { ...f, progress } : f
              ));
            }
          };

          xhr.upload.onloadend = () => {
            uploadSendComplete = true;
            console.log(`[Upload] Send complete for ${file.name}, waiting for S3 response...`);
          };

          xhr.onload = () => {
            console.log(`[Upload] S3 responded for ${file.name}: status=${xhr.status}`);
            if (xhr.status >= 200 && xhr.status < 300) {
              settle(() => resolve(true));
            } else {
              settle(() => reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`)));
            }
          };

          xhr.onerror = () => settle(() => reject(new Error('Network error')));
          xhr.ontimeout = () => settle(() => reject(new Error('Upload timed out')));
          xhr.onabort = () => settle(() => reject(new Error('Upload was aborted')));

          // Stall detection: abort if no upload progress for 60s.
          // Once the browser finishes sending bytes (uploadSendComplete), we're
          // just waiting for S3 to respond — the XHR timeout handles that phase.
          stallCheckInterval = setInterval(() => {
            if (uploadSendComplete) return; // Trust XHR timeout for response phase
            const timeSinceProgress = Date.now() - lastProgressTime;
            if (timeSinceProgress > STALL_TIMEOUT_MS) {
              console.warn(`[Upload] Stall detected for ${file.name}: no progress for ${Math.round(timeSinceProgress / 1000)}s, aborting`);
              xhr.abort();
            }
          }, STALL_CHECK_INTERVAL_MS);

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

  // Multipart upload for large files — uploads in 10MB parts so R2 processes
  // incrementally. The final "complete" call is near-instant (no long finalization).
  // Includes stall detection per-part and aborts the R2 multipart upload on failure.
  const uploadSingleFileToS3Multipart = async (
    file: File,
    index: number,
  ): Promise<{ index: number; s3Key: string } | null> => {
    const contentType = getContentType(file);
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);

    console.log(`[Upload] Starting multipart upload for ${file.name} (${fileSizeMB}MB, type: ${contentType})`);

    setUploadingFiles(prev => prev.map((f, i) =>
      i === index ? { ...f, status: 'uploading' as const, progress: 0 } : f
    ));

    let uploadId: string | undefined;
    let key: string | undefined;

    try {
      // Step 1: Initiate multipart upload and get part URLs
      const initResult = await initiateS3MultipartUpload(file.name, contentType, file.size, MULTIPART_PART_SIZE);
      if (!initResult.success || !initResult.uploadId || !initResult.key || !initResult.partUrls) {
        throw new Error(initResult.error || 'Failed to initiate multipart upload');
      }

      uploadId = initResult.uploadId;
      key = initResult.key;
      const { partUrls } = initResult;
      const totalParts = partUrls.length;

      console.log(`[Upload] Multipart initiated for ${file.name}: ${totalParts} parts, key=${key}`);

      // Step 2: Upload parts sequentially (file-level concurrency handles parallelism)
      const partBytesUploaded = new Array(totalParts).fill(0);

      for (let i = 0; i < totalParts; i++) {
        const start = i * MULTIPART_PART_SIZE;
        const end = Math.min(start + MULTIPART_PART_SIZE, file.size);
        const partBlob = file.slice(start, end);
        const partUrl = partUrls.find(p => p.partNumber === i + 1)!.url;
        const partSizeMB = ((end - start) / (1024 * 1024)).toFixed(1);

        let partUploaded = false;
        for (let attempt = 0; attempt <= MAX_RETRIES && !partUploaded; attempt++) {
          if (attempt > 0) {
            const retryDelay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
            console.log(`[Upload] Retry part ${i + 1} attempt ${attempt} for ${file.name} after ${retryDelay}ms`);
            await delay(retryDelay);
          }

          try {
            await new Promise<void>((resolve, reject) => {
              const xhr = new XMLHttpRequest();
              const timeoutMs = Math.max(60000, Math.ceil(partBlob.size / (1024 * 1024)) * 30000);
              xhr.timeout = timeoutMs;

              let lastProgressTime = Date.now();
              let stallCheckInterval: ReturnType<typeof setInterval> | null = null;
              let isSettled = false;

              const cleanup = () => {
                if (stallCheckInterval) {
                  clearInterval(stallCheckInterval);
                  stallCheckInterval = null;
                }
              };

              const settle = (fn: () => void) => {
                if (!isSettled) {
                  isSettled = true;
                  cleanup();
                  fn();
                }
              };

              xhr.upload.onprogress = (event) => {
                lastProgressTime = Date.now();
                if (event.lengthComputable) {
                  partBytesUploaded[i] = event.loaded;
                  const totalUploaded = partBytesUploaded.reduce((sum, b) => sum + b, 0);
                  const progress = Math.round((totalUploaded / file.size) * 100);
                  setUploadingFiles(prev => prev.map((f, idx) =>
                    idx === index ? { ...f, progress: Math.min(progress, 99) } : f
                  ));
                }
              };

              xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                  settle(() => resolve());
                } else {
                  settle(() => reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`)));
                }
              };

              xhr.onerror = () => settle(() => reject(new Error('Network error')));
              xhr.ontimeout = () => settle(() => reject(new Error('Part upload timed out')));
              xhr.onabort = () => settle(() => reject(new Error('Part upload stalled')));

              // Stall detection: abort if no progress for 60s
              stallCheckInterval = setInterval(() => {
                const timeSinceProgress = Date.now() - lastProgressTime;
                if (timeSinceProgress > STALL_TIMEOUT_MS) {
                  console.warn(`[Upload] Part ${i + 1} stall detected for ${file.name}: no progress for ${Math.round(timeSinceProgress / 1000)}s`);
                  xhr.abort();
                }
              }, STALL_CHECK_INTERVAL_MS);

              xhr.open('PUT', partUrl);
              xhr.send(partBlob);
            });

            partBytesUploaded[i] = end - start; // Mark full part size
            partUploaded = true;
            console.log(`[Upload] Part ${i + 1}/${totalParts} (${partSizeMB}MB) uploaded for ${file.name}`);
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Part upload failed';
            console.warn(`[Upload] Part ${i + 1} attempt ${attempt + 1} failed for ${file.name}: ${errorMsg}`);
            if (errorMsg.startsWith('HTTP 4')) break; // Don't retry client errors
            if (attempt === MAX_RETRIES) throw err;
          }
        }
        if (!partUploaded) {
          throw new Error(`Failed to upload part ${i + 1} after retries`);
        }
      }

      // Step 3: Complete multipart upload (server lists parts for ETags, then assembles)
      console.log(`[Upload] All parts uploaded for ${file.name}, completing multipart upload...`);
      setUploadingFiles(prev => prev.map((f, i) =>
        i === index ? { ...f, progress: 100 } : f
      ));

      const completeResult = await completeS3MultipartUpload(key, uploadId);
      if (!completeResult.success) {
        throw new Error(completeResult.error || 'Failed to complete multipart upload');
      }

      console.log(`[Upload] Multipart upload complete for ${file.name}`);
      setUploadingFiles(prev => prev.map((f, i) =>
        i === index ? { ...f, status: 'complete' as const, progress: 100 } : f
      ));

      return { index, s3Key: key };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Upload failed';
      console.error(`[Upload] Multipart upload failed for ${file.name}: ${errorMsg}`);
      // Abort the multipart upload in R2 to clean up incomplete parts
      if (key && uploadId) {
        console.log(`[Upload] Aborting multipart upload in R2 for ${file.name}`);
        abortS3MultipartUpload(key, uploadId).catch(() => {
          // Best-effort cleanup — don't block error reporting
        });
      }
      setUploadingFiles(prev => prev.map((f, i) =>
        i === index ? { ...f, status: 'error' as const, error: errorMsg } : f
      ));
      return null;
    }
  };

  // Adaptive semaphore for concurrency control
  // Starts at max limit, can be reduced on errors for better throughput
  const createAdaptiveSemaphore = (initialLimit: number, minLimit: number) => {
    let limit = initialLimit;
    let running = 0;
    let consecutiveErrors = 0;
    const queue: (() => void)[] = [];

    const tryRunNext = () => {
      while (running < limit && queue.length > 0) {
        running++;
        const next = queue.shift();
        next?.();
      }
    };

    return {
      acquire: () => new Promise<void>((resolve) => {
        if (running < limit) {
          running++;
          resolve();
        } else {
          queue.push(resolve);
        }
      }),
      release: (success: boolean = true) => {
        running--;
        if (success) {
          consecutiveErrors = 0;
          // Gradually increase limit back up on success
          if (limit < initialLimit) {
            limit = Math.min(initialLimit, limit + 1);
          }
        } else {
          consecutiveErrors++;
          // Reduce concurrency on consecutive errors (network congestion)
          if (consecutiveErrors >= 2 && limit > minLimit) {
            const newLimit = Math.max(minLimit, Math.floor(limit * 0.7));
            if (newLimit < limit) {
              console.log(`[Upload] Reducing concurrency from ${limit} to ${newLimit} due to errors`);
              limit = newLimit;
            }
          }
        }
        tryRunNext();
      },
      getLimit: () => limit,
    };
  };

  // Optimized batch S3 upload with adaptive concurrency.
  // Uses multipart upload for large files to avoid the long R2 finalization wait.
  const uploadFilesToS3Batch = async (files: File[], initialState: UploadingFile[]): Promise<UploadedFile[]> => {
    console.log(`[Upload] Starting batch upload for ${files.length} files`);

    // Separate files into small (single PUT) and large (multipart)
    const smallFiles = files.map((f, i) => ({ file: f, index: i })).filter(({ file }) => file.size < MULTIPART_THRESHOLD);
    const largeFiles = files.map((f, i) => ({ file: f, index: i })).filter(({ file }) => file.size >= MULTIPART_THRESHOLD);

    console.log(`[Upload] ${smallFiles.length} small files (single PUT), ${largeFiles.length} large files (multipart)`);

    // Step 1: Get presigned PUT URLs for small files only
    let smallFileUrlMap = new Map<number, { url: string; key: string }>();
    if (smallFiles.length > 0) {
      const fileInfos: FileInfo[] = smallFiles.map(({ file }) => ({
        filename: file.name,
        contentType: getContentType(file),
        fileSize: file.size,
      }));

      console.log('[Upload] Requesting presigned URLs for small files...');
      const batchUrlResult = await getBatchS3UploadUrls(fileInfos);
      if (batchUrlResult.success && batchUrlResult.urls) {
        for (const urlInfo of batchUrlResult.urls) {
          // Map batch index back to original file index
          const originalIndex = smallFiles[urlInfo.index].index;
          smallFileUrlMap.set(originalIndex, { url: urlInfo.url, key: urlInfo.key });
        }
        console.log(`[Upload] Got ${batchUrlResult.urls.length} presigned URLs for small files`);
      } else {
        console.error('[Upload] Failed to get presigned URLs:', batchUrlResult.error);
        // Mark small files as errors
        for (const { index } of smallFiles) {
          setUploadingFiles(prev => prev.map((f, i) =>
            i === index ? { ...f, status: 'error' as const, error: 'Failed to get upload URL' } : f
          ));
        }
      }
    }

    // Step 2: Upload all files with adaptive concurrency control
    const maxConcurrent = getMaxConcurrentUploads();
    const minConcurrent = isMobile ? MAX_CONCURRENT_UPLOADS_MOBILE : MIN_CONCURRENT_UPLOADS_DESKTOP;
    const semaphore = createAdaptiveSemaphore(maxConcurrent, minConcurrent);

    const uploadPromises = files.map(async (file, index) => {
      await semaphore.acquire();
      let success = false;
      try {
        let result: { index: number; s3Key: string } | null = null;

        if (file.size >= MULTIPART_THRESHOLD) {
          // Large file: use multipart upload (handles its own initiation)
          result = await uploadSingleFileToS3Multipart(file, index);
        } else {
          // Small file: use single PUT with presigned URL
          const urlInfo = smallFileUrlMap.get(index);
          if (!urlInfo) {
            console.error(`[Upload] No URL info for file ${file.name} at index ${index}`);
            setUploadingFiles(prev => prev.map((f, i) =>
              i === index ? { ...f, status: 'error' as const, error: 'Failed to get upload URL' } : f
            ));
            return null;
          }
          result = await uploadSingleFileToS3(file, index, urlInfo);
        }

        success = result !== null;
        return result;
      } finally {
        semaphore.release(success);
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

    // Step 3: Confirm all uploads in a single batch request.
    // For multipart files this is just extracting fileId from the key (already stored).
    // For single PUT files this confirms the upload.
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
    console.log(`[Upload] uploadFiles called with ${files.length} files, isUploadingRef.current=${isUploadingRef.current}`);

    // Prevent starting a new upload batch while one is in progress
    // Use ref instead of state to avoid stale closure issues with useCallback
    // State check would see old values due to handleFileSelect/handleDrop closures
    if (isUploadingRef.current) {
      console.warn('[Upload] Upload already in progress (isUploadingRef=true), ignoring new upload request');
      return;
    }

    // Mark uploads as in progress immediately using ref
    isUploadingRef.current = true;
    console.log('[Upload] Starting new upload batch, isUploadingRef set to true');

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
        // Fallback: Upload files using adaptive concurrency (same pattern as S3 batch)
        console.log('[Upload] Using fallback upload with adaptive concurrency');
        const maxConcurrent = getMaxConcurrentUploads();
        const minConcurrent = isMobile ? MAX_CONCURRENT_UPLOADS_MOBILE : MIN_CONCURRENT_UPLOADS_DESKTOP;
        const semaphore = createAdaptiveSemaphore(maxConcurrent, minConcurrent);

        const uploadPromises = validFiles.map(async (file, index) => {
          await semaphore.acquire();
          let success = false;
          try {
            const result = await uploadSingleFile(file, index, initialState[index].previewUrl);
            success = result !== null;
            return result;
          } finally {
            semaphore.release(success);
          }
        });

        const allResults = await Promise.allSettled(uploadPromises);
        results = allResults
          .map(r => r.status === 'fulfilled' ? r.value : null)
          .filter((r): r is UploadedFile => r !== null);
      }

      // Notify parent of completed uploads
      console.log(`[Upload] Batch finished with ${results.length} successful uploads, autoProcess=${autoProcessEnabled}`);
      if (results.length > 0) {
        onUploadComplete(results, showAutoProcessOption ? autoProcessEnabled : undefined);
      }
    } finally {
      // Always reset state - even if an error occurred
      // This prevents uploads from getting permanently stuck
      console.log('[Upload] Finally block reached, resetting all state...');
      setUploadingFiles([]);
      setIsPreparing(false);
      isUploadingRef.current = false;
      console.log('[Upload] Upload batch complete, isUploadingRef reset to false');
    }
  };

  // Always keep the ref updated with the latest uploadFiles function
  // This ensures callbacks always call the current version, avoiding stale closures
  uploadFilesRef.current = uploadFiles;

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      // Use ref to always call the latest uploadFiles function
      uploadFilesRef.current(files);
    }
  }, [disabled]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      // Use ref to always call the latest uploadFiles function
      uploadFilesRef.current(Array.from(files));
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
      {/* Auto-Process Toggle - Shown BEFORE upload area so users can enable it first */}
      {showAutoProcessOption && !isUploading && !autoProcessLoading && (
        <div className="bg-white border border-[#e0dbd4] rounded-2xl p-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <div className="relative flex items-center pt-0.5">
              <input
                type="checkbox"
                checked={autoProcessEnabled}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  setAutoProcessEnabled(enabled);
                  // Save to localStorage immediately
                  try {
                    localStorage.setItem('timeback_auto_process', JSON.stringify(enabled));
                  } catch {
                    // localStorage not available
                  }
                  // Save to server in background (PATCH only updates this field, not all preferences)
                  fetch('/api/user/preferences', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ autoProcessOnUpload: enabled }),
                  }).catch(() => {
                    // Silently fail
                  });
                }}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-[#e0dbd4] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#e85d26] rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#e85d26]"></div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-[#0a0a0a]">Auto-process after upload</span>
                {videosProcessed < 5 && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setShowAutoProcessTooltip(!showAutoProcessTooltip);
                      }}
                      className="text-[#8a8580] hover:text-[#0a0a0a] transition-colors"
                      aria-label="More info about auto-process"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>
                    {showAutoProcessTooltip && (
                      <div className="absolute left-0 top-6 z-10 w-64 p-3 bg-white border border-[#e0dbd4] rounded-xl shadow-lg text-xs text-[#0a0a0a]">
                        <p>When enabled, uploaded videos are automatically edited using your saved settings. You can close this page after uploading.</p>
                        {!hasSavedSettings && (
                          <p className="mt-2 text-[#e85d26]">
                            <a href="/api/user/preferences" onClick={(e) => { e.preventDefault(); }} className="underline">Set up your editing preferences first</a> — process a video manually to save your settings.
                          </p>
                        )}
                        <button
                          onClick={() => setShowAutoProcessTooltip(false)}
                          className="mt-2 text-[#8a8580] hover:text-[#0a0a0a] text-xs"
                        >
                          Got it
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <p className="text-xs text-[#8a8580] mt-1">
                {autoProcessEnabled
                  ? 'Videos will be processed automatically using your saved settings. You can close this page after uploading.'
                  : 'Enable to automatically process videos with your saved settings.'}
              </p>
              {videosProcessed < 5 && !hasSavedSettings && !showAutoProcessTooltip && (
                <p className="text-xs text-[#e85d26] mt-1">
                  Set up your editing preferences first &mdash; process a video manually to save your settings.
                </p>
              )}
            </div>
          </label>
        </div>
      )}

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed rounded-2xl p-6 sm:p-12 text-center transition-all cursor-pointer
          ${isDragging
            ? 'border-[#e85d26] bg-[#e85d26]/10'
            : 'border-[#e0dbd4] hover:border-[#8a8580] bg-white/50'
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
                <div className="w-12 h-12 sm:w-16 sm:h-16 border-4 border-[#e85d26] border-t-transparent rounded-full animate-spin" />
                <p className="text-lg sm:text-xl text-[#0a0a0a]">Preparing videos...</p>
                <p className="text-[#8a8580] text-sm sm:text-base">This may take a moment on mobile</p>
              </>
            ) : (
              <>
                <svg
                  className={`w-12 h-12 sm:w-16 sm:h-16 upload-icon-pulse ${isDragging ? 'text-[#e85d26]' : 'text-[#8a8580]'}`}
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

                <p className="text-lg sm:text-xl text-[#0a0a0a]">
                  {isDragging ? 'Drop your videos here' : 'Upload your raw recordings'}
                </p>
                <p className="text-[#8a8580] text-sm sm:text-base">Drag and drop or tap to browse</p>
                <p className="text-xs sm:text-sm text-[#8a8580]">We&apos;ll remove silences, add captions, and get them post-ready &middot; Up to 50 at once</p>
              </>
            )}
          </div>
        </label>
      </div>

      {/* Upload Progress List */}
      {uploadingFiles.length > 0 && (
        <div className="bg-white border border-[#e0dbd4] rounded-2xl p-4 space-y-3">
          <div className="flex justify-between items-center text-sm text-[#8a8580]">
            <span>Uploading files</span>
            <span>{completedCount} / {totalCount} complete</span>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {uploadingFiles.map((item, index) => (
              <div key={index} className="flex items-center gap-3 p-2 bg-[#f5f0e8] rounded-2xl">
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
                    <div className="w-5 h-5 border-2 border-[#e85d26] border-t-transparent rounded-full animate-spin" />
                  )}
                </div>

                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#0a0a0a] truncate">{item.file.name}</p>
                  <p className="text-xs text-[#8a8580]">
                    {item.status === 'error' ? item.error : formatFileSize(item.file.size)}
                  </p>
                </div>

                {/* Progress Bar or Finalizing State */}
                {item.status === 'uploading' && (
                  <div className="flex items-center gap-2">
                    {item.progress === 100 ? (
                      <span className="text-xs text-[#e85d26] animate-pulse">Finalizing...</span>
                    ) : (
                      <>
                        <div className="w-20 bg-[#e0dbd4] rounded-full h-1.5">
                          <div
                            className="bg-[#e85d26] h-1.5 rounded-full transition-all"
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                        <span className="text-xs text-[#8a8580] w-8">{item.progress}%</span>
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
        <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-2xl text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
