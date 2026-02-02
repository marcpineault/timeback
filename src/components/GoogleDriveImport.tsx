'use client';

import { useState, useEffect, useCallback } from 'react';

interface ImportedFile {
  fileId: string;
  filename: string;
  originalName: string;
  size: number;
  s3Key?: string;
}

interface GoogleDriveImportProps {
  onImportComplete: (files: ImportedFile[]) => void;
  disabled?: boolean;
}

// Google Picker API types
declare global {
  interface Window {
    gapi: {
      load: (api: string, callback: () => void) => void;
      client: {
        init: (config: object) => Promise<void>;
        getToken: () => { access_token: string } | null;
      };
    };
    google: {
      picker: {
        PickerBuilder: new () => GooglePickerBuilder;
        ViewId: {
          DOCS: string;
          DOCS_VIDEOS: string;
        };
        DocsView: new (viewId?: string) => GoogleDocsView;
        Feature: {
          MULTISELECT_ENABLED: string;
          NAV_HIDDEN: string;
        };
        Action: {
          PICKED: string;
          CANCEL: string;
        };
      };
    };
  }
}

interface GooglePickerBuilder {
  setAppId(appId: string): GooglePickerBuilder;
  setOAuthToken(token: string): GooglePickerBuilder;
  addView(view: GoogleDocsView): GooglePickerBuilder;
  enableFeature(feature: string): GooglePickerBuilder;
  setCallback(callback: (data: GooglePickerResponse) => void): GooglePickerBuilder;
  setTitle(title: string): GooglePickerBuilder;
  build(): { setVisible(visible: boolean): void };
}

interface GoogleDocsView {
  setMimeTypes(mimeTypes: string): GoogleDocsView;
  setIncludeFolders(include: boolean): GoogleDocsView;
  setSelectFolderEnabled(enabled: boolean): GoogleDocsView;
}

interface GooglePickerResponse {
  action: string;
  docs?: {
    id: string;
    name: string;
    mimeType: string;
    sizeBytes?: string;
  }[];
}

export default function GoogleDriveImport({ onImportComplete, disabled }: GoogleDriveImportProps) {
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoadingPicker, setIsLoadingPicker] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [pickerApiLoaded, setPickerApiLoaded] = useState(false);

  // Check connection status on mount
  useEffect(() => {
    checkConnectionStatus();
  }, []);

  // Handle OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('gdrive_connected');
    const gdriveError = params.get('gdrive_error');

    if (connected === 'true') {
      checkConnectionStatus();
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

  // Load Google Picker API
  useEffect(() => {
    if (!isConfigured || pickerApiLoaded) return;

    const loadGoogleApis = () => {
      // Load Google API script
      if (!document.getElementById('google-api-script')) {
        const script = document.createElement('script');
        script.id = 'google-api-script';
        script.src = 'https://apis.google.com/js/api.js';
        script.async = true;
        script.defer = true;
        script.onload = () => {
          window.gapi.load('picker', () => {
            setPickerApiLoaded(true);
          });
        };
        document.body.appendChild(script);
      } else if (window.gapi) {
        window.gapi.load('picker', () => {
          setPickerApiLoaded(true);
        });
      }
    };

    loadGoogleApis();
  }, [isConfigured, pickerApiLoaded]);

  const checkConnectionStatus = async () => {
    try {
      const response = await fetch('/api/google-drive/status');
      if (!response.ok) {
        setIsConfigured(false);
        setIsConnected(false);
        return;
      }

      const data = await response.json();
      setIsConfigured(data.configured ?? false);
      setIsConnected(data.connected ?? false);

      if (data.accessToken) {
        setAccessToken(data.accessToken);
      }

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
      // Request auth with picker scope
      const response = await fetch('/api/google-drive/auth?scope=picker');
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to connect to Google Drive');
        setIsConnecting(false);
        return;
      }

      if (data.authUrl) {
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

  const importFiles = useCallback(async (files: { id: string; name: string; mimeType: string }[]) => {
    setIsImporting(true);
    setImportProgress(`Importing ${files.length} file(s) from Google Drive...`);
    setError(null);

    try {
      const response = await fetch('/api/google-drive/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: files.map(f => ({
            fileId: f.id,
            name: f.name,
            mimeType: f.mimeType,
          })),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Import failed');
      }

      if (result.files && result.files.length > 0) {
        onImportComplete(result.files);
      }

      if (result.totalFailed > 0) {
        const failedNames = result.failed.map((f: { name: string }) => f.name).join(', ');
        setError(`Failed to import: ${failedNames}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setIsImporting(false);
      setImportProgress('');
    }
  }, [onImportComplete]);

  const openPicker = useCallback(async () => {
    if (!accessToken || !pickerApiLoaded) {
      // If we don't have a token, try to get one
      if (!accessToken) {
        const response = await fetch('/api/google-drive/token');
        if (response.ok) {
          const data = await response.json();
          if (data.accessToken) {
            setAccessToken(data.accessToken);
          } else {
            setError('Please connect to Google Drive first');
            return;
          }
        } else {
          setError('Please connect to Google Drive first');
          return;
        }
      }
      return;
    }

    setIsLoadingPicker(true);
    setError(null);

    try {
      // Get the client ID from the config endpoint
      const configResponse = await fetch('/api/google-drive/config');
      const configData = await configResponse.json();

      if (!configData.clientId) {
        throw new Error('Google Drive not configured');
      }

      const view = new window.google.picker.DocsView()
        .setMimeTypes('video/mp4,video/quicktime,video/webm,video/x-msvideo,video/x-m4v,video/3gpp')
        .setIncludeFolders(true);

      const picker = new window.google.picker.PickerBuilder()
        .setAppId(configData.appId || configData.clientId.split('-')[0])
        .setOAuthToken(accessToken)
        .addView(view)
        .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
        .setTitle('Select videos from Google Drive')
        .setCallback((data: GooglePickerResponse) => {
          if (data.action === window.google.picker.Action.PICKED && data.docs) {
            const selectedFiles = data.docs.map((doc) => ({
              id: doc.id,
              name: doc.name,
              mimeType: doc.mimeType,
            }));
            // Import the selected files
            importFiles(selectedFiles);
          }
          setIsLoadingPicker(false);
        })
        .build();

      picker.setVisible(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open picker');
      setIsLoadingPicker(false);
    }
  }, [accessToken, pickerApiLoaded, importFiles]);

  // Not configured - don't show
  if (isConfigured === false) {
    return null;
  }

  // Loading state
  if (isConfigured === null) {
    return null;
  }

  const isDisabled = isConnecting || isLoadingPicker || isImporting || disabled;

  return (
    <div className="relative">
      {!isConnected ? (
        <button
          onClick={handleConnect}
          disabled={isDisabled}
          className="w-full px-4 py-3 bg-white hover:bg-gray-100 text-gray-800 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isConnecting ? (
            <>
              <div className="w-4 h-4 border-2 border-gray-800 border-t-transparent rounded-full animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.01 1.485c-2.082 0-3.754.02-3.743.047.01.02 1.708 3.001 3.774 6.62l3.76 6.574h3.76c2.07 0 3.76-.02 3.76-.047 0-.02-1.692-3.001-3.76-6.574l-3.76-6.62h-3.79zm-4.76 0l-3.76 6.62c-2.068 3.573-3.76 6.554-3.76 6.574 0 .027 1.69.047 3.76.047h3.76l3.76-6.574c2.068-3.619 3.764-6.6 3.774-6.62.01-.027-1.66-.047-3.743-.047h-3.79zm4.76 13.194l-1.88 3.287-1.88 3.287h7.52l-1.88-3.287-1.88-3.287z" />
              </svg>
              Import from Google Drive
            </>
          )}
        </button>
      ) : (
        <button
          onClick={openPicker}
          disabled={isDisabled || !pickerApiLoaded}
          className="w-full px-4 py-3 bg-white hover:bg-gray-100 text-gray-800 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isImporting ? (
            <>
              <div className="w-4 h-4 border-2 border-gray-800 border-t-transparent rounded-full animate-spin" />
              Importing...
            </>
          ) : isLoadingPicker ? (
            <>
              <div className="w-4 h-4 border-2 border-gray-800 border-t-transparent rounded-full animate-spin" />
              Opening...
            </>
          ) : !pickerApiLoaded ? (
            <>
              <div className="w-4 h-4 border-2 border-gray-800 border-t-transparent rounded-full animate-spin" />
              Loading...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.01 1.485c-2.082 0-3.754.02-3.743.047.01.02 1.708 3.001 3.774 6.62l3.76 6.574h3.76c2.07 0 3.76-.02 3.76-.047 0-.02-1.692-3.001-3.76-6.574l-3.76-6.62h-3.79zm-4.76 0l-3.76 6.62c-2.068 3.573-3.76 6.554-3.76 6.574 0 .027 1.69.047 3.76.047h3.76l3.76-6.574c2.068-3.619 3.764-6.6 3.774-6.62.01-.027-1.66-.047-3.743-.047h-3.79zm4.76 13.194l-1.88 3.287-1.88 3.287h7.52l-1.88-3.287-1.88-3.287z" />
              </svg>
              Import from Google Drive
            </>
          )}
        </button>
      )}

      {/* Import Progress */}
      {isImporting && importProgress && (
        <div className="mt-2 text-sm text-gray-400 text-center">
          {importProgress}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-red-400 text-xs">{error}</p>
        </div>
      )}
    </div>
  );
}
