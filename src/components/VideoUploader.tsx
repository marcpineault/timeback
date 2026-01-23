'use client';

import { useState, useCallback } from 'react';
import {
  uploadVideo,
  initChunkedUpload,
  uploadChunk,
  finalizeUpload
} from '@/app/actions/upload';

export interface UploadedFile {
  fileId: string;
  filename: string;
  originalName: string;
  size: number;
}

interface UploadingFile {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'complete' | 'error';
  error?: string;
  result?: UploadedFile;
}

interface VideoUploaderProps {
  onUploadComplete: (files: UploadedFile[]) => void;
  disabled?: boolean;
}

// 5MB chunks to stay well under Railway's 10MB limit
// Base64 encoding adds ~33% overhead, so actual data per request is ~3.75MB
const CHUNK_SIZE = 5 * 1024 * 1024;

export default function VideoUploader({ onUploadComplete, disabled }: VideoUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [error, setError] = useState<string | null>(null);

  const isUploading = uploadingFiles.some(f => f.status === 'uploading' || f.status === 'pending');

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  // Helper to convert ArrayBuffer to base64
  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  // Chunked upload for large files
  const uploadFileChunked = async (file: File, index: number): Promise<UploadedFile | null> => {
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

      // Step 2: Upload chunks
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunkBlob = file.slice(start, end);
        const chunkBuffer = await chunkBlob.arrayBuffer();
        const chunkBase64 = arrayBufferToBase64(chunkBuffer);

        const chunkResult = await uploadChunk(uploadId, chunkIndex, totalChunks, chunkBase64);

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
  const uploadFileDirectly = async (file: File, index: number): Promise<UploadedFile | null> => {
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

  const uploadSingleFile = async (file: File, index: number): Promise<UploadedFile | null> => {
    // Use chunked upload for files over 5MB
    if (file.size > CHUNK_SIZE) {
      return uploadFileChunked(file, index);
    } else {
      return uploadFileDirectly(file, index);
    }
  };

  const uploadFiles = async (files: File[]) => {
    setError(null);

    // Validate file types
    const validTypes = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'];
    const validFiles = files.filter(f => validTypes.includes(f.type));

    if (validFiles.length === 0) {
      setError('No valid video files selected. Please upload MP4, MOV, WebM, or AVI files.');
      return;
    }

    if (validFiles.length < files.length) {
      setError(`${files.length - validFiles.length} file(s) skipped - invalid format.`);
    }

    // Initialize upload state
    const initialState: UploadingFile[] = validFiles.map(file => ({
      file,
      progress: 0,
      status: 'pending',
    }));
    setUploadingFiles(initialState);

    // Upload files sequentially to avoid overwhelming the server
    const results: UploadedFile[] = [];
    for (let i = 0; i < validFiles.length; i++) {
      const result = await uploadSingleFile(validFiles[i], i);
      if (result) {
        results.push(result);
      }
    }

    // Notify parent of completed uploads
    if (results.length > 0) {
      onUploadComplete(results);
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
    // Reset input so same files can be selected again
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
          border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer
          ${isDragging
            ? 'border-blue-500 bg-blue-500/10'
            : 'border-gray-600 hover:border-gray-500 bg-gray-800/50'
          }
          ${isUploading || disabled ? 'pointer-events-none opacity-75' : ''}
        `}
      >
        <input
          type="file"
          accept="video/mp4,video/quicktime,video/webm,video/x-msvideo"
          onChange={handleFileSelect}
          className="hidden"
          id="video-upload"
          disabled={isUploading || disabled}
          multiple
        />
        <label htmlFor="video-upload" className="cursor-pointer">
          <div className="flex flex-col items-center gap-4">
            <svg
              className={`w-16 h-16 ${isDragging ? 'text-blue-500' : 'text-gray-500'}`}
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

            <p className="text-xl text-gray-300">
              {isDragging ? 'Drop your videos here' : 'Drag and drop your videos'}
            </p>
            <p className="text-gray-500">or click to browse</p>
            <p className="text-sm text-gray-600">MP4, MOV, WebM, AVI supported • Multiple files allowed</p>
          </div>
        </label>
      </div>

      {/* Upload Progress List */}
      {uploadingFiles.length > 0 && (
        <div className="bg-gray-800 rounded-xl p-4 space-y-3">
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
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  )}
                </div>

                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{item.file.name}</p>
                  <p className="text-xs text-gray-500">
                    {item.status === 'error' ? item.error : formatFileSize(item.file.size)}
                  </p>
                </div>

                {/* Progress Bar */}
                {item.status === 'uploading' && (
                  <div className="flex items-center gap-2">
                    <div className="w-20 bg-gray-600 rounded-full h-1.5">
                      <div
                        className="bg-blue-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 w-8">{item.progress}%</span>
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
