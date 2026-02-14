'use client';

import { useState, useEffect } from 'react';

interface FileToUpload {
  name: string;
  url: string;
}

interface GoogleDriveUploadProps {
  files: FileToUpload[];
  onComplete?: (uploadedCount: number, failedCount: number) => void;
}

export default function GoogleDriveUpload({ files, onComplete }: GoogleDriveUploadProps) {
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [uploadResult, setUploadResult] = useState<{
    uploaded: number;
    failed: number;
    failedDetails?: { name: string; error: string }[];
    folderLink?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createFolder, setCreateFolder] = useState(true);

  // Check connection status on mount and after OAuth callback
  useEffect(() => {
    checkConnectionStatus();
  }, []);

  // Handle OAuth callback messages
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('gdrive_connected');
    const gdriveError = params.get('gdrive_error');

    if (connected === 'true') {
      // Refresh status after successful OAuth
      checkConnectionStatus();
      // Clean URL
      const url = new URL(window.location.href);
      url.searchParams.delete('gdrive_connected');
      window.history.replaceState({}, '', url.pathname);
    }

    if (gdriveError) {
      setError(`Google Drive connection failed: ${gdriveError}`);
      const url = new URL(window.location.href);
      url.searchParams.delete('gdrive_error');
      window.history.replaceState({}, '', url.pathname);
    }
  }, []);

  const checkConnectionStatus = async () => {
    try {
      const response = await fetch('/api/google-drive/status');

      // Handle API errors properly
      if (!response.ok) {
        setIsConfigured(false);
        setIsConnected(false);
        return;
      }

      const data = await response.json();

      setIsConfigured(data.configured ?? false);
      setIsConnected(data.connected ?? false);

      if (data.needsReconnect) {
        setError('Google Drive session expired. Please reconnect.');
      }
    } catch {
      setIsConfigured(false);
      setIsConnected(false);
    }
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      const response = await fetch('/api/google-drive/auth');
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to connect to Google Drive');
        setIsConnecting(false);
        return;
      }

      if (data.authUrl) {
        // Redirect to Google OAuth
        window.location.href = data.authUrl;
      } else {
        setError('Failed to get auth URL');
        setIsConnecting(false);
      }
    } catch {
      setError('Failed to connect to Google Drive');
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await fetch('/api/google-drive/disconnect', { method: 'POST' });
      setIsConnected(false);
      setUploadResult(null);
      setError(null);
    } catch {
      setError('Failed to disconnect');
    }
  };

  const handleUpload = async () => {
    setIsUploading(true);
    setError(null);
    setUploadResult(null);
    setUploadProgress('Preparing upload...');

    try {
      const filesToUpload = files.map((file) => ({
        name: file.name,
        mimeType: 'video/mp4',
        url: file.url,
      }));

      setUploadProgress(`Uploading ${filesToUpload.length} file(s) to Google Drive...`);

      const response = await fetch('/api/google-drive/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: filesToUpload,
          createFolder,
          folderName: createFolder
            ? `TimeBack Export ${new Date().toLocaleDateString()}`
            : undefined,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setUploadResult({
          uploaded: result.totalUploaded,
          failed: result.totalFailed,
          failedDetails: result.failed,
          folderLink: result.folderId
            ? `https://drive.google.com/drive/folders/${result.folderId}`
            : undefined,
        });
        // Log any failures for debugging
        if (result.failed && result.failed.length > 0) {
          console.error('[Google Drive] Upload failures:', result.failed);
        }
        onComplete?.(result.totalUploaded, result.totalFailed);
      } else {
        if (response.status === 401) {
          setIsConnected(false);
          setError('Google Drive authorization expired. Please reconnect.');
        } else {
          setError(result.error || 'Upload failed');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
      setUploadProgress('');
    }
  };

  // Not configured state
  if (isConfigured === false) {
    return null; // Don't show the component if Google Drive isn't configured
  }

  // Loading state
  if (isConfigured === null) {
    return null;
  }

  return (
    <div className="border-t border-[#e0dbd4] pt-4 mt-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-[#8a8580]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12.01 1.485c-2.082 0-3.754.02-3.743.047.01.02 1.708 3.001 3.774 6.62l3.76 6.574h3.76c2.07 0 3.76-.02 3.76-.047 0-.02-1.692-3.001-3.76-6.574l-3.76-6.62h-3.79zm-4.76 0l-3.76 6.62c-2.068 3.573-3.76 6.554-3.76 6.574 0 .027 1.69.047 3.76.047h3.76l3.76-6.574c2.068-3.619 3.764-6.6 3.774-6.62.01-.027-1.66-.047-3.743-.047h-3.79zm4.76 13.194l-1.88 3.287-1.88 3.287h7.52l-1.88-3.287-1.88-3.287z" />
          </svg>
          <span className="text-[#0a0a0a] text-sm font-medium">Google Drive</span>
          {isConnected && (
            <span className="text-xs text-green-500 bg-green-500/10 px-2 py-0.5 rounded">
              Connected
            </span>
          )}
        </div>

        {!isConnected ? (
          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className="px-4 py-2 bg-white hover:bg-gray-100 text-gray-800 rounded-full text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {isConnecting ? (
              <>
                <div className="w-4 h-4 border-2 border-gray-800 border-t-transparent rounded-full animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12.01 1.485c-2.082 0-3.754.02-3.743.047.01.02 1.708 3.001 3.774 6.62l3.76 6.574h3.76c2.07 0 3.76-.02 3.76-.047 0-.02-1.692-3.001-3.76-6.574l-3.76-6.62h-3.79zm-4.76 0l-3.76 6.62c-2.068 3.573-3.76 6.554-3.76 6.574 0 .027 1.69.047 3.76.047h3.76l3.76-6.574c2.068-3.619 3.764-6.6 3.774-6.62.01-.027-1.66-.047-3.743-.047h-3.79zm4.76 13.194l-1.88 3.287-1.88 3.287h7.52l-1.88-3.287-1.88-3.287z" />
                </svg>
                Connect Google Drive
              </>
            )}
          </button>
        ) : (
          <div className="flex flex-wrap gap-2">
            {!uploadResult && (
              <>
                <label className="flex items-center gap-2 text-sm text-[#8a8580] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createFolder}
                    onChange={(e) => setCreateFolder(e.target.checked)}
                    className="rounded border-[#e0dbd4] bg-[#e0dbd4] text-[#e85d26] focus:ring-[#e85d26]"
                  />
                  Create folder
                </label>
                <button
                  onClick={handleUpload}
                  disabled={isUploading || files.length === 0}
                  className="px-4 py-2 bg-[#e85d26] hover:bg-[#d14d1a] disabled:bg-[#e85d26] text-white rounded-full text-sm font-medium transition-colors flex items-center gap-2"
                >
                  {isUploading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span className="hidden sm:inline">Uploading...</span>
                      <span className="sm:hidden">...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      <span className="hidden sm:inline">Upload to Drive ({files.length})</span>
                      <span className="sm:hidden">Drive ({files.length})</span>
                    </>
                  )}
                </button>
              </>
            )}
            <button
              onClick={handleDisconnect}
              className="px-3 py-2 text-[#8a8580] hover:text-[#0a0a0a] text-sm transition-colors"
              title="Disconnect Google Drive"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Upload Progress */}
      {isUploading && uploadProgress && (
        <div className="mt-3 text-sm text-[#8a8580]">
          {uploadProgress}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-2xl">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Upload Result */}
      {uploadResult && (
        <div className={`mt-3 p-3 ${uploadResult.uploaded > 0 ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'} border rounded-2xl`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <p className={`${uploadResult.uploaded > 0 ? 'text-green-400' : 'text-red-400'} text-sm font-medium`}>
                {uploadResult.uploaded} file(s) uploaded to Google Drive
                {uploadResult.failed > 0 && (
                  <span className="text-yellow-400"> ({uploadResult.failed} failed)</span>
                )}
              </p>
              {/* Show error details for failed files */}
              {uploadResult.failedDetails && uploadResult.failedDetails.length > 0 && (
                <div className="mt-2 text-xs text-red-400">
                  {uploadResult.failedDetails.map((f, i) => (
                    <p key={i} className="mt-1">
                      <span className="font-medium">{f.name}:</span> {f.error}
                    </p>
                  ))}
                </div>
              )}
            </div>
            {uploadResult.folderLink && (
              <a
                href={uploadResult.folderLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#e85d26] hover:text-[#d14d1a] text-sm flex items-center gap-1"
              >
                Open in Drive
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
