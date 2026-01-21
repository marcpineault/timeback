'use client';

interface DownloadResultProps {
  downloadUrl: string;
  filename: string;
  onReset: () => void;
}

export default function DownloadResult({ downloadUrl, filename, onReset }: DownloadResultProps) {
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

      <div className="flex gap-4 justify-center">
        <a
          href={downloadUrl}
          download={filename}
          className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download Video
        </a>

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
