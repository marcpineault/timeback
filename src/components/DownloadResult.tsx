'use client';

import { useDownload } from '@/hooks/useDownload';

interface DownloadResultProps {
  downloadUrl: string;
  filename: string;
  onReset: () => void;
}

export default function DownloadResult({ downloadUrl, filename, onReset }: DownloadResultProps) {
  const {
    isDownloading,
    error,
    success,
    platform,
    downloadVideo,
    reset,
  } = useDownload({
    maxRetries: 3,
  });

  const handleSave = () => {
    downloadVideo(downloadUrl, filename);
  };

  const handleReset = () => {
    reset();
    onReset();
  };

  return (
    <div className="bg-gray-800 rounded-xl p-8 text-center space-y-6">
      <div className="flex justify-center">
        <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center">
          <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Processing Complete!</h2>
        <p className="text-gray-400">Your video is ready to save</p>
      </div>

      <div className="bg-gray-700/50 rounded-lg p-4">
        <p className="text-gray-300 font-mono text-sm truncate">{filename}</p>
      </div>

      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}

      {success && (
        <p className="text-green-400 text-sm">
          {platform === 'ios'
            ? 'Tap "Save Video" in the share menu to save to your Camera Roll'
            : 'Video saved successfully!'
          }
        </p>
      )}

      <div className="flex flex-col gap-3">
        {/* Primary action - platform specific */}
        {platform === 'ios' ? (
          <>
            <button
              onClick={handleSave}
              disabled={isDownloading}
              className="w-full px-6 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              {isDownloading ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Preparing...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Save to Camera Roll
                </>
              )}
            </button>
            <p className="text-xs text-gray-500">Opens share menu - tap &quot;Save Video&quot; to save</p>
          </>
        ) : platform === 'android' ? (
          <>
            <button
              onClick={handleSave}
              disabled={isDownloading}
              className="w-full px-6 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              {isDownloading ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Downloading...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Save Video
                </>
              )}
            </button>
            <p className="text-xs text-gray-500">Saves to your device</p>
          </>
        ) : (
          <button
            onClick={handleSave}
            disabled={isDownloading}
            className="w-full px-6 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            {isDownloading ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Downloading...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Video
              </>
            )}
          </button>
        )}

        <button
          onClick={handleReset}
          className="w-full px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
        >
          Process Another
        </button>
      </div>
    </div>
  );
}
