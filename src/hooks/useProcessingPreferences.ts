'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ProcessingConfig } from '@/components/ProcessingOptions';

const STORAGE_KEY = 'timeback_processing_config';
const AUTO_PROCESS_KEY = 'timeback_auto_process';

// Default config - matches ProcessingOptions DEFAULT_CONFIG
const DEFAULT_CONFIG: ProcessingConfig = {
  generateCaptions: true,
  headline: '',
  headlinePosition: 'top',
  headlineStyle: 'speech-bubble',
  captionStyle: 'instagram',
  silenceThreshold: -25,
  silenceDuration: 0.5,
  autoSilenceThreshold: true,
  useHookAsHeadline: false,
  generateAIHeadline: false,
  generateBRoll: false,
  bRollConfig: {
    style: 'dynamic',
    intensity: 'medium',
    maxMoments: 3,
  },
  normalizeAudio: true,
  aspectRatio: 'original',
  speechCorrection: false,
  speechCorrectionConfig: {
    removeFillerWords: true,
    removeRepeatedWords: true,
    removeRepeatedPhrases: true,
    removeFalseStarts: true,
    removeSelfCorrections: true,
    aggressiveness: 'moderate',
    confidenceThreshold: 0.6,
    language: 'auto',
    customFillerWords: [],
    customFillerPhrases: [],
  },
  speechCorrectionPreset: null,
};

export interface ProcessingPreferencesState {
  config: ProcessingConfig;
  autoProcessOnUpload: boolean;
  activePreset: string | null;
  isLoading: boolean;
  isSaving: boolean;
  hasUnsavedChanges: boolean;
  error: string | null;
}

export interface UseProcessingPreferencesReturn extends ProcessingPreferencesState {
  setConfig: (config: ProcessingConfig | ((prev: ProcessingConfig) => ProcessingConfig)) => void;
  setAutoProcessOnUpload: (enabled: boolean) => void;
  setActivePreset: (preset: string | null) => void;
  savePreferences: () => Promise<boolean>;
  resetToDefaults: () => void;
  reloadFromServer: () => Promise<void>;
}

export function useProcessingPreferences(): UseProcessingPreferencesReturn {
  const [config, setConfigState] = useState<ProcessingConfig>(DEFAULT_CONFIG);
  const [autoProcessOnUpload, setAutoProcessState] = useState(false);
  const [activePreset, setActivePresetState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track initial load to avoid marking as unsaved
  const initialLoadComplete = useRef(false);
  const lastSavedConfig = useRef<string>('');

  // Load preferences from server with localStorage fallback
  const loadPreferences = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/user/preferences');

      if (response.ok) {
        const data = await response.json();

        if (data.preferences) {
          // Use server preferences
          const serverConfig: ProcessingConfig = {
            ...DEFAULT_CONFIG,
            generateCaptions: data.preferences.generateCaptions,
            headline: '', // Always reset headline (session-specific)
            headlinePosition: data.preferences.headlinePosition,
            headlineStyle: data.preferences.headlineStyle,
            captionStyle: data.preferences.captionStyle,
            silenceThreshold: data.preferences.silenceThreshold,
            silenceDuration: data.preferences.silenceDuration,
            autoSilenceThreshold: data.preferences.autoSilenceThreshold,
            useHookAsHeadline: data.preferences.useHookAsHeadline,
            generateAIHeadline: data.preferences.generateAIHeadline,
            normalizeAudio: data.preferences.normalizeAudio,
            aspectRatio: data.preferences.aspectRatio,
            speechCorrection: data.preferences.speechCorrection,
            speechCorrectionConfig: {
              ...DEFAULT_CONFIG.speechCorrectionConfig,
              ...(data.preferences.speechCorrectionConfig || {}),
            },
            speechCorrectionPreset: data.preferences.speechCorrectionPreset ?? null,
            generateBRoll: data.preferences.generateBRoll,
          };

          setConfigState(serverConfig);
          setAutoProcessState(data.preferences.autoProcessOnUpload);
          setActivePresetState(data.preferences.activePreset);
          lastSavedConfig.current = JSON.stringify(serverConfig);

          // Also update localStorage as cache
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(serverConfig));
            localStorage.setItem(AUTO_PROCESS_KEY, JSON.stringify(data.preferences.autoProcessOnUpload));
          } catch {
            // localStorage not available
          }
        } else {
          // No saved preferences, use defaults or localStorage
          loadFromLocalStorage();
        }
      } else if (response.status === 401) {
        // Not authenticated, use localStorage only
        loadFromLocalStorage();
      } else {
        throw new Error('Failed to load preferences');
      }
    } catch (err) {
      console.warn('Failed to load preferences from server, using localStorage:', err);
      loadFromLocalStorage();
    } finally {
      setIsLoading(false);
      initialLoadComplete.current = true;
    }
  }, []);

  // Load from localStorage (fallback)
  const loadFromLocalStorage = useCallback(() => {
    try {
      const savedConfig = localStorage.getItem(STORAGE_KEY);
      const savedAutoProcess = localStorage.getItem(AUTO_PROCESS_KEY);

      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        const mergedConfig = {
          ...DEFAULT_CONFIG,
          ...parsed,
          headline: '', // Always reset headline
          speechCorrectionConfig: {
            ...DEFAULT_CONFIG.speechCorrectionConfig,
            ...(parsed.speechCorrectionConfig || {}),
          },
          bRollConfig: {
            ...DEFAULT_CONFIG.bRollConfig,
            ...(parsed.bRollConfig || {}),
          },
        };
        setConfigState(mergedConfig);
        lastSavedConfig.current = JSON.stringify(mergedConfig);
      }

      if (savedAutoProcess) {
        setAutoProcessState(JSON.parse(savedAutoProcess));
      }
    } catch {
      // localStorage not available or invalid JSON
    }
  }, []);

  // Save preferences to server
  const savePreferences = useCallback(async (): Promise<boolean> => {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/user/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...config,
          autoProcessOnUpload,
          activePreset,
        }),
      });

      if (response.ok) {
        lastSavedConfig.current = JSON.stringify(config);
        setHasUnsavedChanges(false);

        // Update localStorage cache
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
          localStorage.setItem(AUTO_PROCESS_KEY, JSON.stringify(autoProcessOnUpload));
        } catch {
          // localStorage not available
        }

        return true;
      } else if (response.status === 401) {
        // Not authenticated - save to localStorage only
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
          localStorage.setItem(AUTO_PROCESS_KEY, JSON.stringify(autoProcessOnUpload));
          lastSavedConfig.current = JSON.stringify(config);
          setHasUnsavedChanges(false);
          return true;
        } catch {
          setError('Failed to save preferences locally');
          return false;
        }
      } else {
        throw new Error('Failed to save preferences');
      }
    } catch (err) {
      console.error('Error saving preferences:', err);
      setError('Failed to save preferences');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [config, autoProcessOnUpload, activePreset]);

  // Reset to defaults
  const resetToDefaults = useCallback(() => {
    setConfigState(DEFAULT_CONFIG);
    setAutoProcessState(false);
    setActivePresetState(null);
    setHasUnsavedChanges(true);
  }, []);

  // Config setter that tracks changes
  const setConfig = useCallback((update: ProcessingConfig | ((prev: ProcessingConfig) => ProcessingConfig)) => {
    setConfigState(prev => {
      const newConfig = typeof update === 'function' ? update(prev) : update;

      // Mark as changed if different from last saved
      if (initialLoadComplete.current && JSON.stringify(newConfig) !== lastSavedConfig.current) {
        setHasUnsavedChanges(true);
      }

      // Also save to localStorage immediately for quick access
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...newConfig, headline: '' }));
      } catch {
        // localStorage not available
      }

      return newConfig;
    });
  }, []);

  // Auto-process setter
  const setAutoProcessOnUpload = useCallback((enabled: boolean) => {
    setAutoProcessState(enabled);
    setHasUnsavedChanges(true);

    // Also save to localStorage immediately
    try {
      localStorage.setItem(AUTO_PROCESS_KEY, JSON.stringify(enabled));
    } catch {
      // localStorage not available
    }
  }, []);

  // Active preset setter
  const setActivePreset = useCallback((preset: string | null) => {
    setActivePresetState(preset);
    setHasUnsavedChanges(true);
  }, []);

  // Reload from server
  const reloadFromServer = useCallback(async () => {
    await loadPreferences();
  }, [loadPreferences]);

  // Load on mount
  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  return {
    config,
    autoProcessOnUpload,
    activePreset,
    isLoading,
    isSaving,
    hasUnsavedChanges,
    error,
    setConfig,
    setAutoProcessOnUpload,
    setActivePreset,
    savePreferences,
    resetToDefaults,
    reloadFromServer,
  };
}

// Simple hook for just checking auto-process preference (used in VideoUploader)
export function useAutoProcessPreference(): {
  autoProcessOnUpload: boolean;
  setAutoProcessOnUpload: (enabled: boolean) => void;
  isLoading: boolean;
} {
  const [autoProcessOnUpload, setAutoProcessState] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Load from localStorage first for instant display
    try {
      const saved = localStorage.getItem(AUTO_PROCESS_KEY);
      if (saved) {
        setAutoProcessState(JSON.parse(saved));
      }
    } catch {
      // localStorage not available
    }

    // Then load from server
    fetch('/api/user/preferences')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.preferences) {
          setAutoProcessState(data.preferences.autoProcessOnUpload);
        }
      })
      .catch(() => {
        // Use localStorage value
      })
      .finally(() => setIsLoading(false));
  }, []);

  const setAutoProcessOnUpload = useCallback((enabled: boolean) => {
    setAutoProcessState(enabled);

    // Save to localStorage immediately
    try {
      localStorage.setItem(AUTO_PROCESS_KEY, JSON.stringify(enabled));
    } catch {
      // localStorage not available
    }

    // Save to server in background (PATCH only updates this field, not all preferences)
    fetch('/api/user/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoProcessOnUpload: enabled }),
    }).catch(() => {
      // Silently fail - localStorage is saved
    });
  }, []);

  return {
    autoProcessOnUpload,
    setAutoProcessOnUpload,
    isLoading,
  };
}
