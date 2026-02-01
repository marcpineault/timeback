'use client'

import { useState, useEffect } from 'react'
import VideoUploader, { UploadedFile } from '@/components/VideoUploader'
import ProcessingOptions, { ProcessingConfig } from '@/components/ProcessingOptions'
import VideoQueue, { QueuedVideo } from '@/components/VideoQueue'
import VideoPreview from '@/components/VideoPreview'
import MediaEditor from '@/components/MediaEditor'
import GoogleDriveUpload from '@/components/GoogleDriveUpload'

interface EnabledFeatures {
  speechCorrection: boolean
}

// localStorage key for persisting video queue
const QUEUE_STORAGE_KEY = 'timeback_video_queue';

interface VideoProcessorProps {
  userId: string
  canProcess: boolean
  videosRemaining: number
  hasWatermark: boolean
  enabledFeatures?: EnabledFeatures
}

export default function VideoProcessor({
  userId,
  canProcess,
  videosRemaining: initialVideosRemaining,
  hasWatermark,
  enabledFeatures = { speechCorrection: false },
}: VideoProcessorProps) {
  const [videoQueue, setVideoQueue] = useState<QueuedVideo[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [previewVideo, setPreviewVideo] = useState<QueuedVideo | null>(null)
  const [editorVideo, setEditorVideo] = useState<QueuedVideo | null>(null)
  const [lastConfig, setLastConfig] = useState<ProcessingConfig | null>(null)
  const [processingStatus, setProcessingStatus] = useState<string>('')
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop'>('desktop')
  const [isSavingAll, setIsSavingAll] = useState(false)
  const [saveProgress, setSaveProgress] = useState<{
    current: number
    total: number
    savedIds: Set<string>
    failedIds: Set<string>
    skippedIds: Set<string>
  } | null>(null)

  useEffect(() => {
    const ua = navigator.userAgent
    if (/iPhone|iPad|iPod/i.test(ua)) {
      setPlatform('ios')
    } else if (/Android/i.test(ua)) {
      setPlatform('android')
    } else {
      setPlatform('desktop')
    }
  }, [])
  const [videosRemaining, setVideosRemaining] = useState(initialVideosRemaining)
  const [isQueueLoaded, setIsQueueLoaded] = useState(false)

  // Restore video queue from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(QUEUE_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as QueuedVideo[];
        // Only restore videos that can actually be used:
        // - Completed videos (have downloadUrl)
        // - Videos with s3Key (can be re-processed)
        const restorable = parsed.filter(v => {
          // Completed videos are fully restorable
          if (v.status === 'complete' && v.downloadUrl) return true;
          // Videos with s3Key can be re-processed (mark as pending)
          if (v.file.s3Key) return true;
          // Videos without s3Key and not complete cannot be restored
          return false;
        }).map(v => {
          // Reset processing/error videos with s3Key back to pending
          if (v.status !== 'complete' && v.file.s3Key) {
            return { ...v, status: 'pending' as const, error: undefined };
          }
          // Clear blob previewUrl (not valid after refresh) and any stale errors for completed videos
          return {
            ...v,
            error: v.status === 'complete' ? undefined : v.error,
            file: { ...v.file, previewUrl: undefined }
          };
        });

        if (restorable.length > 0) {
          setVideoQueue(restorable);
        }
      }
    } catch {
      // localStorage not available or invalid JSON
    }
    setIsQueueLoaded(true);
  }, []);

  // Save video queue to localStorage when it changes
  useEffect(() => {
    if (!isQueueLoaded) return;

    try {
      if (videoQueue.length === 0) {
        localStorage.removeItem(QUEUE_STORAGE_KEY);
      } else {
        // Save queue (blob URLs won't persist but that's fine)
        localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(videoQueue));
      }
    } catch {
      // localStorage not available
    }
  }, [videoQueue, isQueueLoaded]);

  const handleUploadComplete = (files: UploadedFile[]) => {
    const maxFiles = Math.min(files.length, videosRemaining)
    const newVideos: QueuedVideo[] = files.slice(0, maxFiles).map(file => ({
      file,
      status: 'pending',
    }))
    setVideoQueue(prev => [...prev, ...newVideos])
  }

  const handleRemoveVideo = (fileId: string) => {
    setVideoQueue(prev => prev.filter(v => v.file.fileId !== fileId))
  }

  const handleClearQueue = () => {
    setVideoQueue([])
  }

  const handlePreviewVideo = (video: QueuedVideo) => {
    setPreviewVideo(video)
  }

  const handleClosePreview = () => {
    setPreviewVideo(null)
  }

  const handleOpenEditor = (video: QueuedVideo) => {
    setEditorVideo(video)
  }

  const handleCloseEditor = () => {
    setEditorVideo(null)
  }

  const handleEditorComplete = (filename: string, _stats: { sectionsRemoved: number; timeRemoved: number }) => {
    // Update the video in queue with new filename (sections removed)
    if (editorVideo) {
      setVideoQueue(prev =>
        prev.map(v => v.file.fileId === editorVideo.file.fileId
          ? {
              ...v,
              outputFilename: filename,
              downloadUrl: `/api/download/${filename}`,
            }
          : v
        )
      )
    }
    setEditorVideo(null)
  }

  const handleRetry = async (fileId: string) => {
    if (!lastConfig) return

    const video = videoQueue.find(v => v.file.fileId === fileId)
    if (!video) return

    // Reset video to pending, then process it
    setVideoQueue(prev =>
      prev.map(v => v.file.fileId === fileId ? { ...v, status: 'pending', error: undefined } : v)
    )

    // Process the single video
    setIsProcessing(true)
    setProcessingStatus(`Retrying ${video.file.originalName}...`)

    setVideoQueue(prev =>
      prev.map(v => v.file.fileId === fileId ? { ...v, status: 'processing' } : v)
    )

    const result = await processVideo(video, lastConfig)

    setVideoQueue(prev =>
      prev.map(v => v.file.fileId === fileId ? result : v)
    )

    setIsProcessing(false)
    setProcessingStatus('')
  }

  const processVideo = async (video: QueuedVideo, config: ProcessingConfig): Promise<QueuedVideo> => {
    try {
      const response = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId: video.file.fileId,
          filename: video.file.filename,
          s3Key: video.file.s3Key, // Pass S3 key for files uploaded to S3
          userId,
          addWatermark: hasWatermark,
          ...config,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Processing failed')
      }

      const data = await response.json()
      return {
        ...video,
        status: 'complete',
        error: undefined, // Clear any previous error on success
        downloadUrl: data.downloadUrl,
        outputFilename: data.outputFilename,
      }
    } catch (err) {
      return {
        ...video,
        status: 'error',
        error: err instanceof Error ? err.message : 'Processing failed',
      }
    }
  }

  // Process multiple videos concurrently with a limit
  const MAX_CONCURRENT_PROCESSING = 3

  const handleProcess = async (config: ProcessingConfig) => {
    setIsProcessing(true)
    setLastConfig(config)

    const pendingVideos = videoQueue.filter(v => v.status === 'pending')
    let completedCount = 0

    // Mark all pending videos as processing
    setVideoQueue(prev =>
      prev.map(v => pendingVideos.some(p => p.file.fileId === v.file.fileId)
        ? { ...v, status: 'processing' }
        : v
      )
    )

    // Process videos in parallel with concurrency limit
    const processWithConcurrency = async () => {
      const queue = [...pendingVideos]
      let activeCount = 0

      const updateStatus = () => {
        const remaining = pendingVideos.length - completedCount
        if (activeCount > 1) {
          setProcessingStatus(`Processing ${activeCount} videos concurrently (${completedCount}/${pendingVideos.length} complete)`)
        } else if (remaining > 0) {
          setProcessingStatus(`Processing ${completedCount + 1}/${pendingVideos.length}`)
        }
      }

      const processNext = async (): Promise<void> => {
        if (queue.length === 0) return

        const video = queue.shift()!
        activeCount++
        updateStatus()

        try {
          const result = await processVideo(video, config)
          setVideoQueue(prev =>
            prev.map(v => v.file.fileId === video.file.fileId ? result : v)
          )
        } finally {
          activeCount--
          completedCount++
          updateStatus()
          // Process next video when this one finishes
          await processNext()
        }
      }

      // Start up to MAX_CONCURRENT_PROCESSING videos
      const initialBatch = Math.min(MAX_CONCURRENT_PROCESSING, queue.length)
      const workers = Array(initialBatch).fill(null).map(() => processNext())

      // Wait for all to complete
      await Promise.all(workers)
    }

    await processWithConcurrency()

    setIsProcessing(false)
    setProcessingStatus('')
    // Update videos remaining count locally (no page reload to preserve queue)
    setVideosRemaining(prev => Math.max(0, prev - pendingVideos.length))
  }

  // Save videos to camera roll one by one (mobile only)
  const handleSaveAll = async () => {
    const completedVideos = videoQueue.filter(v => v.status === 'complete' && v.downloadUrl)
    setIsSavingAll(true)

    const savedIds = new Set<string>()
    const failedIds = new Set<string>()
    const skippedIds = new Set<string>()

    setSaveProgress({
      current: 0,
      total: completedVideos.length,
      savedIds,
      failedIds,
      skippedIds,
    })

    for (let i = 0; i < completedVideos.length; i++) {
      const video = completedVideos[i]

      setSaveProgress({
        current: i + 1,
        total: completedVideos.length,
        savedIds: new Set(savedIds),
        failedIds: new Set(failedIds),
        skippedIds: new Set(skippedIds),
      })

      try {
        // Add cache-busting and retry logic
        const url = video.downloadUrl!.includes('?')
          ? `${video.downloadUrl}&_t=${Date.now()}`
          : `${video.downloadUrl}?_t=${Date.now()}`

        let response: Response | null = null
        let lastError: Error | null = null

        // Retry up to 3 times with exponential backoff, with timeout
        const TIMEOUT_MS = 180000 // 3 minutes for slow mobile connections
        for (let attempt = 0; attempt < 3; attempt++) {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

          try {
            response = await fetch(url, { signal: controller.signal })
            clearTimeout(timeoutId)
            if (response.ok) break

            if (response.status >= 400 && response.status < 500) {
              // Client error - don't retry
              break
            }
            // Server error - retry
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
          } catch (err) {
            clearTimeout(timeoutId)
            lastError = err instanceof Error ? err : new Error('Network error')
            if (attempt < 2) {
              await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
            }
          }
        }

        if (!response?.ok) {
          console.error('Save failed:', response?.status || lastError?.message)
          failedIds.add(video.file.fileId)
          continue
        }

        const blob = await response.blob()
        const file = new File([blob], video.outputFilename || 'video.mp4', { type: 'video/mp4' })

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: 'Save Video',
            })
            savedIds.add(video.file.fileId)
          } catch (shareErr) {
            // User cancelled this share - continue to next video instead of stopping
            if (shareErr instanceof Error && shareErr.name === 'AbortError') {
              // Track as skipped so user knows what happened
              skippedIds.add(video.file.fileId)
              continue
            }
            // Other share error - mark as failed
            failedIds.add(video.file.fileId)
          }
        } else {
          // Fallback: try standard download on mobile
          const blobUrl = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = blobUrl
          link.download = video.outputFilename || 'video.mp4'
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          URL.revokeObjectURL(blobUrl)
          savedIds.add(video.file.fileId)
        }
      } catch (err) {
        failedIds.add(video.file.fileId)
      }
    }

    // Keep progress visible for a moment to show final state
    setSaveProgress({
      current: completedVideos.length,
      total: completedVideos.length,
      savedIds: new Set(savedIds),
      failedIds: new Set(failedIds),
      skippedIds: new Set(skippedIds),
    })

    // Clear progress after a delay if all succeeded (no failures or skips)
    if (failedIds.size === 0 && skippedIds.size === 0) {
      setTimeout(() => setSaveProgress(null), 2000)
    }

    setIsSavingAll(false)
  }

  // Desktop: download all videos sequentially
  const handleDownloadAll = async () => {
    const completedVideos = videoQueue.filter(v => v.status === 'complete' && v.downloadUrl)
    setIsSavingAll(true)

    for (let i = 0; i < completedVideos.length; i++) {
      const video = completedVideos[i]
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
      try {
        const response = await fetch(video.downloadUrl!)
        if (!response.ok) {
          console.error('Download failed:', response.status, response.statusText)
          continue
        }
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = video.outputFilename || 'video.mp4'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      } catch (err) {
        console.error('Download failed:', err)
      }
    }

    setIsSavingAll(false)
  }

  const pendingVideos = videoQueue.filter(v => v.status === 'pending')
  const completedVideos = videoQueue.filter(v => v.status === 'complete')
  const hasVideosToProcess = pendingVideos.length > 0
  const hasCompletedVideos = completedVideos.length > 0
  const allComplete = videoQueue.length > 0 && pendingVideos.length === 0 && !isProcessing
  const canUploadMore = videosRemaining > 0

  // Only show limit reached if no videos in queue at all
  if (!canProcess && videoQueue.length === 0) {
    return (
      <div className="bg-gray-800 rounded-xl p-8 text-center">
        <div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">Monthly Limit Reached</h3>
        <p className="text-gray-400 mb-6">Upgrade your plan to process more videos this month.</p>
        <a
          href="/pricing"
          className="inline-flex px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
        >
          View Plans
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {!isProcessing && canUploadMore && (
        <VideoUploader
          onUploadComplete={handleUploadComplete}
          disabled={isProcessing}
        />
      )}

      <VideoQueue
        videos={videoQueue}
        onRemove={handleRemoveVideo}
        onClear={handleClearQueue}
        onPreview={handlePreviewVideo}
        onRetry={lastConfig ? handleRetry : undefined}
        onEdit={handleOpenEditor}
      />

      {hasVideosToProcess && !isProcessing && (
        <ProcessingOptions
          uploadedFile={pendingVideos[0].file}
          onProcess={handleProcess}
          isProcessing={isProcessing}
          videoCount={pendingVideos.length}
          enabledFeatures={enabledFeatures}
        />
      )}

      {isProcessing && (
        <div className="bg-gray-800 rounded-xl p-4 sm:p-6">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="animate-spin h-6 w-6 sm:h-8 sm:w-8 border-4 border-blue-500 border-t-transparent rounded-full flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-white font-medium text-sm sm:text-base">Processing videos...</p>
              <p className="text-gray-400 text-xs sm:text-sm truncate">{processingStatus || 'This may take a few minutes'}</p>
            </div>
          </div>
          <div className="mt-3 sm:mt-4 text-xs text-gray-500 overflow-x-auto">
            <p className="whitespace-nowrap sm:whitespace-normal">Silence removal → Audio → Transcription → Captions → Final output</p>
          </div>
        </div>
      )}

      {allComplete && hasCompletedVideos && (
        <div className="bg-gray-800 rounded-xl p-4 sm:p-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-white font-medium text-sm sm:text-base">All videos processed!</p>
                  <p className="text-gray-400 text-xs sm:text-sm">{completedVideos.length} video(s) ready for review</p>
                </div>
              </div>
              {(platform === 'ios' || platform === 'android') ? (
                <div className="flex flex-col gap-2">
                  <button
                    onClick={handleSaveAll}
                    disabled={isSavingAll}
                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    {isSavingAll ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        {saveProgress
                          ? `Saving ${saveProgress.current}/${saveProgress.total}...`
                          : 'Preparing...'}
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Save to Camera Roll
                      </>
                    )}
                  </button>
                  {/* Progress and status display */}
                  {saveProgress && (
                    <div className="text-xs text-gray-400 text-center">
                      {isSavingAll ? (
                        <p>Tap &quot;Save Video&quot; in each share menu</p>
                      ) : saveProgress.failedIds.size > 0 || saveProgress.skippedIds.size > 0 ? (
                        <p className="text-amber-400">
                          {saveProgress.savedIds.size} saved
                          {saveProgress.skippedIds.size > 0 && `, ${saveProgress.skippedIds.size} skipped`}
                          {saveProgress.failedIds.size > 0 && `, ${saveProgress.failedIds.size} failed`}
                        </p>
                      ) : (
                        <p className="text-green-400">
                          All {saveProgress.savedIds.size} videos saved!
                        </p>
                      )}
                    </div>
                  )}
                  {/* Retry skipped/failed button */}
                  {saveProgress && (saveProgress.failedIds.size > 0 || saveProgress.skippedIds.size > 0) && !isSavingAll && (
                    <button
                      onClick={handleSaveAll}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Retry ({saveProgress.failedIds.size + saveProgress.skippedIds.size})
                    </button>
                  )}
                </div>
              ) : (
                <button
                  onClick={handleDownloadAll}
                  disabled={isSavingAll}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {isSavingAll ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Downloading...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download All
                    </>
                  )}
                </button>
              )}
            </div>
            {/* Review tip - platform specific */}
            <div className="flex items-start gap-2 p-3 bg-gray-700/50 border border-gray-600 rounded-lg">
              <svg className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-gray-300 space-y-2">
                {(platform === 'ios' || platform === 'android') && (
                  <p>
                    <span className="font-medium">How to save:</span> Tap &quot;Save to Camera Roll&quot; above.
                    For each video, tap <span className="text-blue-400">&quot;Save Video&quot;</span> in the share menu that appears.
                  </p>
                )}
                <p>
                  <span className="font-medium">Tip:</span> Use the{' '}
                  <span className="inline-flex items-center gap-1 text-indigo-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    edit
                  </span>{' '}
                  button to cut out any unwanted sections from your video.
                </p>
              </div>
            </div>
          </div>

          <GoogleDriveUpload
            files={completedVideos.map((v) => ({
              name: v.outputFilename || `video_${v.file.fileId}.mp4`,
              url: v.downloadUrl!,
            }))}
          />
        </div>
      )}

      {/* Video Preview Modal */}
      {previewVideo && (previewVideo.file.previewUrl || previewVideo.downloadUrl) && (
        <VideoPreview
          videoUrl={previewVideo.downloadUrl || previewVideo.file.previewUrl!}
          videoName={previewVideo.file.originalName}
          onClose={handleClosePreview}
        />
      )}

      {/* Video Editor Modal */}
      {editorVideo && editorVideo.downloadUrl && editorVideo.outputFilename && (
        <MediaEditor
          videoUrl={editorVideo.downloadUrl}
          videoName={editorVideo.file.originalName}
          filename={editorVideo.outputFilename}
          onClose={handleCloseEditor}
          onComplete={handleEditorComplete}
        />
      )}
    </div>
  )
}
