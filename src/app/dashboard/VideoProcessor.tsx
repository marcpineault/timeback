'use client'

import { useState, useEffect } from 'react'
import JSZip from 'jszip'
import VideoUploader, { UploadedFile } from '@/components/VideoUploader'
import ProcessingOptions, { ProcessingConfig } from '@/components/ProcessingOptions'
import VideoQueue, { QueuedVideo } from '@/components/VideoQueue'
import VideoPreview from '@/components/VideoPreview'

interface VideoProcessorProps {
  userId: string
  canProcess: boolean
  videosRemaining: number
  hasWatermark: boolean
}

export default function VideoProcessor({
  userId,
  canProcess,
  videosRemaining,
  hasWatermark,
}: VideoProcessorProps) {
  const [videoQueue, setVideoQueue] = useState<QueuedVideo[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [previewVideo, setPreviewVideo] = useState<QueuedVideo | null>(null)
  const [lastConfig, setLastConfig] = useState<ProcessingConfig | null>(null)
  const [processingStatus, setProcessingStatus] = useState<string>('')
  const [isDownloading, setIsDownloading] = useState(false)
  const [isDriveConnected, setIsDriveConnected] = useState(false)
  const [isUploadingToDrive, setIsUploadingToDrive] = useState(false)
  const [driveUploadStatus, setDriveUploadStatus] = useState<string>('')

  // Check Google Drive connection status
  useEffect(() => {
    const checkDriveStatus = async () => {
      try {
        const response = await fetch('/api/drive/status')
        if (response.ok) {
          const data = await response.json()
          setIsDriveConnected(data.connected)
        }
      } catch (error) {
        console.error('Failed to check Drive status:', error)
      }
    }
    checkDriveStatus()
  }, [])

  // Handle uploading all videos to Google Drive
  const handleUploadToDrive = async () => {
    const completedVideos = videoQueue.filter(v => v.status === 'complete' && v.downloadUrl)
    if (completedVideos.length === 0) return

    setIsUploadingToDrive(true)
    setDriveUploadStatus(`Uploading 0/${completedVideos.length}...`)

    try {
      for (let i = 0; i < completedVideos.length; i++) {
        const video = completedVideos[i]
        setDriveUploadStatus(`Uploading ${i + 1}/${completedVideos.length}...`)

        await fetch('/api/drive/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoUrl: video.downloadUrl,
            fileName: video.outputFilename || `${video.file.originalName.replace(/\.[^/.]+$/, '')}_processed.mp4`,
          }),
        })
      }
      setDriveUploadStatus('Uploaded to Drive!')
      setTimeout(() => setDriveUploadStatus(''), 3000)
    } catch (error) {
      console.error('Failed to upload to Drive:', error)
      setDriveUploadStatus('Upload failed')
      setTimeout(() => setDriveUploadStatus(''), 3000)
    } finally {
      setIsUploadingToDrive(false)
    }
  }

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

  const handleProcess = async (config: ProcessingConfig) => {
    setIsProcessing(true)
    setLastConfig(config)

    const pendingVideos = videoQueue.filter(v => v.status === 'pending')

    for (let i = 0; i < pendingVideos.length; i++) {
      const video = pendingVideos[i]
      setProcessingStatus(`Processing ${i + 1}/${pendingVideos.length}: ${video.file.originalName}`)

      setVideoQueue(prev =>
        prev.map(v => v.file.fileId === video.file.fileId ? { ...v, status: 'processing' } : v)
      )

      const result = await processVideo(video, config)

      setVideoQueue(prev =>
        prev.map(v => v.file.fileId === video.file.fileId ? result : v)
      )
    }

    setIsProcessing(false)
    setProcessingStatus('')
    // Refresh the page to update usage
    window.location.reload()
  }

  const handleDownloadAll = () => {
    const completedVideos = videoQueue.filter(v => v.status === 'complete' && v.downloadUrl)
    completedVideos.forEach((video, index) => {
      setTimeout(() => {
        const link = document.createElement('a')
        link.href = video.downloadUrl!
        link.download = video.outputFilename || 'video.mp4'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }, index * 500)
    })
  }

  const handleDownloadAsZip = async () => {
    const completedVideos = videoQueue.filter(v => v.status === 'complete' && v.downloadUrl)
    if (completedVideos.length === 0) return

    setIsDownloading(true)

    try {
      const zip = new JSZip()

      // Fetch all videos and add to zip
      for (const video of completedVideos) {
        const response = await fetch(video.downloadUrl!)
        const blob = await response.blob()
        const filename = video.outputFilename || `video_${video.file.fileId}.mp4`
        zip.file(filename, blob)
      }

      // Generate and download ZIP
      const content = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(content)
      const link = document.createElement('a')
      link.href = url
      link.download = `timeback_videos_${Date.now()}.zip`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to create ZIP:', err)
    } finally {
      setIsDownloading(false)
    }
  }

  const pendingVideos = videoQueue.filter(v => v.status === 'pending')
  const completedVideos = videoQueue.filter(v => v.status === 'complete')
  const hasVideosToProcess = pendingVideos.length > 0
  const hasCompletedVideos = completedVideos.length > 0
  const allComplete = videoQueue.length > 0 && pendingVideos.length === 0 && !isProcessing

  if (!canProcess) {
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
      {!isProcessing && (
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
      />

      {hasVideosToProcess && !isProcessing && (
        <ProcessingOptions
          uploadedFile={pendingVideos[0].file}
          onProcess={handleProcess}
          isProcessing={isProcessing}
          videoCount={pendingVideos.length}
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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-white font-medium text-sm sm:text-base">All videos processed!</p>
                <p className="text-gray-400 text-xs sm:text-sm">
                  {completedVideos.length} video(s) ready
                  {driveUploadStatus && <span className="ml-2 text-green-400">{driveUploadStatus}</span>}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:gap-3">
              <button
                onClick={handleDownloadAsZip}
                disabled={isDownloading}
                className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-400 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {isDownloading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span className="hidden sm:inline">Creating ZIP...</span>
                    <span className="sm:hidden">ZIP...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span className="hidden sm:inline">Download as ZIP</span>
                    <span className="sm:hidden">ZIP</span>
                  </>
                )}
              </button>
              {/* Google Drive Upload Button */}
              {isDriveConnected ? (
                <button
                  onClick={handleUploadToDrive}
                  disabled={isUploadingToDrive}
                  className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {isUploadingToDrive ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span className="hidden sm:inline">{driveUploadStatus}</span>
                      <span className="sm:hidden">Uploading...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2L2 19.5h20L12 2zm0 4l6.5 11.5h-13L12 6z"/>
                      </svg>
                      <span className="hidden sm:inline">Save to Drive</span>
                      <span className="sm:hidden">Drive</span>
                    </>
                  )}
                </button>
              ) : (
                <a
                  href="/api/auth/google"
                  className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2L2 19.5h20L12 2zm0 4l6.5 11.5h-13L12 6z"/>
                  </svg>
                  <span className="hidden sm:inline">Connect Drive</span>
                  <span className="sm:hidden">Drive</span>
                </a>
              )}
              <button
                onClick={handleDownloadAll}
                className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span className="hidden sm:inline">Individual</span>
                <span className="sm:hidden">Each</span>
              </button>
              <button
                onClick={handleClearQueue}
                className="w-full sm:w-auto px-3 sm:px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Process More
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Video Preview Modal */}
      {previewVideo && previewVideo.file.previewUrl && (
        <VideoPreview
          videoUrl={previewVideo.file.previewUrl}
          videoName={previewVideo.file.originalName}
          onClose={handleClosePreview}
        />
      )}
    </div>
  )
}
