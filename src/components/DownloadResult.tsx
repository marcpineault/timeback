'use client';

import { useState, useEffect } from 'react';

interface DownloadResultProps {
  downloadUrl: string;
  filename: string;
  onReset: () => void;
}

export default function DownloadResult({ downloadUrl, filename, onReset }: DownloadResultProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    // Detect mobile device
    const checkMobile = () => {
      const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      setIsMobile(mobile);
    };
    checkMobile();
  }, []);

  const saveToDevice = async () => {
    setSaving(true);
    setSaveError(null);

    try {
      // Fetch the video file
      const response = await fetch(downloadUrl);
      const blob = await response.blob();
      const file = new File([blob], filename, { type: 'video/mp4' });

      // Check if Web Share API with files is supported
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Save Video',
        });
      } else {
        // Fallback: create a blob URL and trigger download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      // User cancelled share is not an error
      if (err instanceof Error && err.name !== 'AbortError') {
        setSaveError('Could not save video. Try the download button instead.');
      }
    } finally {
      setSaving(false);
    }
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
        <p className="text-gray-400">Your video is ready to download</p>
      </div>

      <div className="bg-gray-700/50 rounded-lg p-4">
        <p className="text-gray-300 font-mono text-sm truncate">{filename}</p>
      </div>

      {saveError && (
        <p className="text-red-400 text-sm">{saveError}</p>
      )}

      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        {isMobile ? (
          <button
            onClick={saveToDevice}
            disabled={saving}
            className="px-6 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Saving...
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
        ) : (
          <a
            href={downloadUrl}
            download={filename}
            className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download Video
          </a>
        )}

        <button
          onClick={onReset}
          className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
        >
          Process Another
        </button>
      </div>
    </div>
  );
}
