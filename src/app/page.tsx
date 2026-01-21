'use client';

import { useState } from 'react';
import VideoUploader, { UploadedFile } from '@/components/VideoUploader';
import ProcessingOptions, { ProcessingConfig } from '@/components/ProcessingOptions';
import VideoQueue, { QueuedVideo } from '@/components/VideoQueue';

export default function Home() {
  const [videoQueue, setVideoQueue] = useState<QueuedVideo[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentConfig, setCurrentConfig] = useState<ProcessingConfig | null>(null);

  const handleUploadComplete = (files: UploadedFile[]) => {
    const newVideos: QueuedVideo[] = files.map(file => ({
      file,
      status: 'pending',
    }));
    setVideoQueue(prev => [...prev, ...newVideos]);
  };

  const handleRemoveVideo = (fileId: string) => {
    setVideoQueue(prev => prev.filter(v => v.file.fileId !== fileId));
  };

  const handleClearQueue = () => {
    setVideoQueue([]);
    setCurrentConfig(null);
  };

  const processVideo = async (video: QueuedVideo, config: ProcessingConfig): Promise<QueuedVideo> => {
    try {
      const response = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId: video.file.fileId,
          filename: video.file.filename,
          ...config,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Processing failed');
      }

      const data = await response.json();
      return {
        ...video,
        status: 'complete',
        downloadUrl: data.downloadUrl,
        outputFilename: data.outputFilename,
      };
    } catch (err) {
      return {
        ...video,
        status: 'error',
        error: err instanceof Error ? err.message : 'Processing failed',
      };
    }
  };

  const handleProcess = async (config: ProcessingConfig) => {
    setCurrentConfig(config);
    setIsProcessing(true);

    const pendingVideos = videoQueue.filter(v => v.status === 'pending');

    for (const video of pendingVideos) {
      // Mark as processing
      setVideoQueue(prev =>
        prev.map(v => v.file.fileId === video.file.fileId ? { ...v, status: 'processing' } : v)
      );

      // Process
      const result = await processVideo(video, config);

      // Update with result
      setVideoQueue(prev =>
        prev.map(v => v.file.fileId === video.file.fileId ? result : v)
      );
    }

    setIsProcessing(false);
  };

  const handleDownloadAll = () => {
    const completedVideos = videoQueue.filter(v => v.status === 'complete' && v.downloadUrl);
    completedVideos.forEach((video, index) => {
      // Stagger downloads to avoid browser blocking
      setTimeout(() => {
        const link = document.createElement('a');
        link.href = video.downloadUrl!;
        link.download = video.outputFilename || 'video.mp4';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }, index * 500);
    });
  };

  const pendingVideos = videoQueue.filter(v => v.status === 'pending');
  const completedVideos = videoQueue.filter(v => v.status === 'complete');
  const hasVideosToProcess = pendingVideos.length > 0;
  const hasCompletedVideos = completedVideos.length > 0;
  const allComplete = videoQueue.length > 0 && pendingVideos.length === 0 && !isProcessing;

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="max-w-3xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">Timeback</h1>
          <p className="text-gray-400 text-lg">
            Remove silences, add captions, and overlay headlines on your videos
          </p>
        </div>

        {/* Main Content */}
        <div className="space-y-6">
          {/* Upload Area - Always visible when not processing */}
          {!isProcessing && (
            <VideoUploader
              onUploadComplete={handleUploadComplete}
              disabled={isProcessing}
            />
          )}

          {/* Video Queue */}
          <VideoQueue
            videos={videoQueue}
            onRemove={handleRemoveVideo}
            onClear={handleClearQueue}
          />

          {/* Processing Options */}
          {hasVideosToProcess && !isProcessing && (
            <ProcessingOptions
              uploadedFile={pendingVideos[0].file}
              onProcess={handleProcess}
              isProcessing={isProcessing}
              videoCount={pendingVideos.length}
            />
          )}

          {/* Processing Status */}
          {isProcessing && (
            <div className="bg-gray-800 rounded-xl p-6">
              <div className="flex items-center gap-4">
                <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
                <div>
                  <p className="text-white font-medium">Processing videos...</p>
                  <p className="text-gray-400 text-sm">
                    This may take a few minutes depending on video length
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* All Complete Actions */}
          {allComplete && hasCompletedVideos && (
            <div className="bg-gray-800 rounded-xl p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-white font-medium">All videos processed!</p>
                    <p className="text-gray-400 text-sm">{completedVideos.length} video(s) ready to download</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleDownloadAll}
                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download All
                  </button>
                  <button
                    onClick={handleClearQueue}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
                  >
                    Start Over
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-16 text-center text-gray-600 text-sm">
          <p>Powered by FFmpeg and OpenAI Whisper</p>
        </div>
      </div>
    </div>
  );
}
