'use client';

import { useState, useEffect } from 'react';

interface EnabledFeatures {
  speechCorrection: boolean;
}

interface ProcessingOptionsProps {
  onProcess: (options: ProcessingConfig) => void;
  isProcessing: boolean;
  uploadedFile: {
    fileId: string;
    filename: string;
    originalName: string;
  } | null;
  videoCount?: number;
  enabledFeatures?: EnabledFeatures;
}

export type AspectRatioPreset = 'original' | '9:16' | '16:9' | '1:1' | '4:5';

export type HeadlineStyle = 'classic' | 'speech-bubble';

export type BRollStyle = 'minimal' | 'dynamic' | 'data-focused';

export interface BRollConfig {
  style: BRollStyle;
  intensity: 'low' | 'medium' | 'high';
  maxMoments: number;
}

export interface ProcessingConfig {
  generateCaptions: boolean;
  headline: string;
  headlinePosition: 'top' | 'center' | 'bottom';
  headlineStyle: HeadlineStyle;
  captionStyle: 'instagram';
  silenceThreshold: number;
  silenceDuration: number;
  autoSilenceThreshold: boolean;
  useHookAsHeadline: boolean;
  generateAIHeadline: boolean;  // Use AI to generate engaging headline
  generateBRoll: boolean;
  bRollConfig: BRollConfig;
  normalizeAudio: boolean;
  aspectRatio: AspectRatioPreset;
  // Speech correction options
  speechCorrection: boolean;
  speechCorrectionConfig: {
    removeFillerWords: boolean;
    removeRepeatedWords: boolean;
    removeRepeatedPhrases: boolean;
    removeFalseStarts: boolean;
    removeSelfCorrections: boolean;
    aggressiveness: 'conservative' | 'moderate' | 'aggressive';
    confidenceThreshold: number;
    language: string;
    customFillerWords: string[];
    customFillerPhrases: string[];
  };
  speechCorrectionPreset?: string | null;
}

// Processing presets for quick configuration
type PresetKey = 'custom' | 'youtube-shorts' | 'instagram-reels' | 'youtube' | 'instagram-feed';

interface Preset {
  name: string;
  icon: string;
  config: Partial<ProcessingConfig>;
}

const PRESETS: Record<PresetKey, Preset> = {
  custom: {
    name: 'Custom',
    icon: '⚙️',
    config: {},
  },
  'youtube-shorts': {
    name: 'YouTube Shorts',
    icon: '🎬',
    config: {
      aspectRatio: '9:16',
      generateCaptions: true,
      captionStyle: 'instagram',
      normalizeAudio: true,
      autoSilenceThreshold: true,
      silenceDuration: 0.4,
    },
  },
  'instagram-reels': {
    name: 'Instagram Reels',
    icon: '📸',
    config: {
      aspectRatio: '9:16',
      generateCaptions: true,
      captionStyle: 'instagram',
      normalizeAudio: true,
      autoSilenceThreshold: true,
      silenceDuration: 0.3,
    },
  },
  'youtube': {
    name: 'YouTube',
    icon: '▶️',
    config: {
      aspectRatio: '16:9',
      generateCaptions: true,
      captionStyle: 'instagram',
      normalizeAudio: true,
      autoSilenceThreshold: true,
      silenceDuration: 0.5,
    },
  },
  'instagram-feed': {
    name: 'Instagram Feed',
    icon: '🖼️',
    config: {
      aspectRatio: '1:1',
      generateCaptions: true,
      captionStyle: 'instagram',
      normalizeAudio: true,
      autoSilenceThreshold: true,
    },
  },
};

const ASPECT_RATIO_OPTIONS: { value: AspectRatioPreset; label: string; platforms: string }[] = [
  { value: 'original', label: 'Original', platforms: 'Keep as-is' },
  { value: '9:16', label: '9:16 Vertical', platforms: 'Reels, Shorts' },
  { value: '16:9', label: '16:9 Landscape', platforms: 'YouTube, Twitter' },
  { value: '1:1', label: '1:1 Square', platforms: 'Instagram Feed' },
  { value: '4:5', label: '4:5 Portrait', platforms: 'Instagram, Facebook' },
];

// localStorage key for persisting processing config
const STORAGE_KEY = 'timeback_processing_config';

// Speech correction presets with simple labels
const SPEECH_PRESETS = {
  minimal: {
    label: 'Clean',
    description: 'Removes um, uh, and stutters',
    config: {
      removeFillerWords: true,
      removeRepeatedWords: true,
      removeRepeatedPhrases: false,
      removeFalseStarts: false,
      removeSelfCorrections: false,
      aggressiveness: 'conservative' as const,
      confidenceThreshold: 0.80,
    },
  },
  professional: {
    label: 'Professional',
    description: 'Removes all fillers, repeats, and false starts',
    config: {
      removeFillerWords: true,
      removeRepeatedWords: true,
      removeRepeatedPhrases: true,
      removeFalseStarts: true,
      removeSelfCorrections: false,
      aggressiveness: 'moderate' as const,
      confidenceThreshold: 0.60,
    },
  },
  broadcast: {
    label: 'Maximum',
    description: 'Removes everything including self-corrections',
    config: {
      removeFillerWords: true,
      removeRepeatedWords: true,
      removeRepeatedPhrases: true,
      removeFalseStarts: true,
      removeSelfCorrections: true,
      aggressiveness: 'aggressive' as const,
      confidenceThreshold: 0.40,
    },
  },
};

// Default config - used for initial state and merging with saved config
const DEFAULT_CONFIG: ProcessingConfig = {
  generateCaptions: true,
  headline: '',
  headlinePosition: 'top',
  headlineStyle: 'speech-bubble',
  captionStyle: 'instagram',
  silenceThreshold: -25,
  silenceDuration: 0.5,
  autoSilenceThreshold: true, // Default to auto for better out-of-box experience
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
  speechCorrection: true,
  speechCorrectionConfig: {
    removeFillerWords: true,
    removeRepeatedWords: true,
    removeRepeatedPhrases: true,
    removeFalseStarts: true,
    removeSelfCorrections: false,
    aggressiveness: 'moderate',
    confidenceThreshold: 0.6,
    language: 'auto',
    customFillerWords: [],
    customFillerPhrases: [],
  },
  speechCorrectionPreset: 'professional',
};

export default function ProcessingOptions({
  onProcess,
  isProcessing,
  uploadedFile,
  videoCount = 1,
  enabledFeatures = { speechCorrection: false },
}: ProcessingOptionsProps) {
  const [config, setConfig] = useState<ProcessingConfig>(DEFAULT_CONFIG);
  const [activePreset, setActivePreset] = useState<PresetKey>('custom');
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);
  const [isSavingDefaults, setIsSavingDefaults] = useState(false);
  const [saveDefaultsStatus, setSaveDefaultsStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Load saved config from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge with defaults to handle new fields added in updates
        setConfig(prev => ({
          ...prev,
          ...parsed,
          // Always reset headline to empty (session-specific)
          headline: '',
          // Deep merge speechCorrectionConfig
          speechCorrectionConfig: {
            ...prev.speechCorrectionConfig,
            ...(parsed.speechCorrectionConfig || {}),
          },
          // Deep merge bRollConfig
          bRollConfig: {
            ...prev.bRollConfig,
            ...(parsed.bRollConfig || {}),
          },
        }));
      }
    } catch {
      // localStorage not available or invalid JSON - use defaults
    }
    setIsConfigLoaded(true);
  }, []);

  // Save config to localStorage when it changes (after initial load)
  useEffect(() => {
    if (!isConfigLoaded) return;

    try {
      // Don't persist custom headline text (session-specific)
      const toSave = { ...config, headline: '' };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch {
      // localStorage not available - silently ignore
    }
  }, [config, isConfigLoaded]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onProcess(config);
  };

  const applyPreset = (presetKey: PresetKey) => {
    setActivePreset(presetKey);
    if (presetKey !== 'custom') {
      const preset = PRESETS[presetKey];
      setConfig(prev => ({ ...prev, ...preset.config }));
    }
  };

  const handleSaveAsDefault = async () => {
    setIsSavingDefaults(true);
    setSaveDefaultsStatus('idle');

    try {
      const response = await fetch('/api/user/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...config,
          activePreset: activePreset !== 'custom' ? activePreset : null,
        }),
      });

      if (response.ok) {
        setSaveDefaultsStatus('success');
        // Reset status after a delay
        setTimeout(() => setSaveDefaultsStatus('idle'), 3000);
      } else {
        setSaveDefaultsStatus('error');
      }
    } catch {
      setSaveDefaultsStatus('error');
    } finally {
      setIsSavingDefaults(false);
    }
  };

  if (!uploadedFile) return null;

  return (
    <form onSubmit={handleSubmit} className="bg-[#1A1A24] rounded-xl p-4 sm:p-6 space-y-5 sm:space-y-6">
      <div className="flex items-center gap-3 pb-3 sm:pb-4 border-b border-gray-700">
        <svg className="w-5 h-5 sm:w-6 sm:h-6 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <div className="min-w-0">
          <p className="text-white font-medium text-sm sm:text-base truncate">
            {videoCount > 1 ? `${videoCount} videos` : uploadedFile.originalName}
          </p>
          <p className="text-gray-500 text-xs sm:text-sm">
            {videoCount > 1 ? 'Same settings will apply to all videos' : 'Ready to process'}
          </p>
        </div>
      </div>

      {/* Silence Removal Settings */}
      <div className="space-y-3 sm:space-y-4">
        <h3 className="text-base sm:text-lg font-medium text-white">Silence Removal</h3>

        {/* Auto-detect toggle */}
        <div className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
          <div>
            <span className="text-sm text-gray-300">Auto-detect threshold</span>
            <p className="text-xs text-gray-500 mt-0.5">
              Analyzes audio to find optimal settings for each video
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config.autoSilenceThreshold}
              onChange={(e) => setConfig({ ...config, autoSilenceThreshold: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-violet-500 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-indigo-500 peer-checked:to-violet-500"></div>
          </label>
        </div>

        {/* Manual threshold controls - only show when auto is disabled */}
        {!config.autoSilenceThreshold && (
          <div className="space-y-3 sm:space-y-4 p-3 border border-gray-700 rounded-lg">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs sm:text-sm text-gray-400">
                  Silence Threshold
                </label>
                <span className="text-xs sm:text-sm text-white font-medium">{config.silenceThreshold} dB</span>
              </div>
              <input
                type="range"
                value={config.silenceThreshold}
                onChange={(e) => setConfig({ ...config, silenceThreshold: Number(e.target.value) })}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                min="-50"
                max="-15"
                step="1"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Less aggressive</span>
                <span>More aggressive</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs sm:text-sm text-gray-400">
                  Min Silence Duration
                </label>
                <span className="text-xs sm:text-sm text-white font-medium">{config.silenceDuration}s</span>
              </div>
              <input
                type="range"
                value={config.silenceDuration}
                onChange={(e) => setConfig({ ...config, silenceDuration: Number(e.target.value) })}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                min="0.2"
                max="2"
                step="0.1"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Short pauses</span>
                <span>Long pauses</span>
              </div>
            </div>
          </div>
        )}

        {/* Show min silence duration even when auto is enabled */}
        {config.autoSilenceThreshold && (
          <div className="p-3 border border-gray-700 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs sm:text-sm text-gray-400">
                Min Silence Duration
              </label>
              <span className="text-xs sm:text-sm text-white font-medium">{config.silenceDuration}s</span>
            </div>
            <input
              type="range"
              value={config.silenceDuration}
              onChange={(e) => setConfig({ ...config, silenceDuration: Number(e.target.value) })}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              min="0.2"
              max="2"
              step="0.1"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>Short pauses</span>
              <span>Long pauses</span>
            </div>
          </div>
        )}
      </div>

      {/* Audio Enhancement Settings */}
      <div className="space-y-3 sm:space-y-4">
        <h3 className="text-base sm:text-lg font-medium text-white">Audio Enhancement</h3>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.normalizeAudio}
            onChange={(e) => setConfig({ ...config, normalizeAudio: e.target.checked })}
            className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-violet-500 focus:ring-violet-500"
          />
          <span className="text-gray-400">Normalize audio levels</span>
        </label>
        <p className="text-xs text-gray-500">
          Ensures consistent volume throughout the video (-14 LUFS, optimal for social media)
        </p>
      </div>

      {/* Speech Correction Settings */}
      {enabledFeatures.speechCorrection && (
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base sm:text-lg font-medium text-white">Speech Correction</h3>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config.speechCorrection}
              onChange={(e) => setConfig({ ...config, speechCorrection: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-violet-500 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-indigo-500 peer-checked:to-violet-500"></div>
          </label>
        </div>
        <p className="text-xs text-gray-500">
          Automatically removes filler words (um, uh), stutters, and speech mistakes from your video{config.generateCaptions ? ' and captions' : ''}
        </p>

        {config.speechCorrection && (
          <div className="space-y-3">
            {/* Simple preset cards */}
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(SPEECH_PRESETS) as [string, typeof SPEECH_PRESETS[keyof typeof SPEECH_PRESETS]][]).map(([key, preset]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setConfig({
                      ...config,
                      speechCorrectionPreset: key,
                      speechCorrectionConfig: {
                        ...config.speechCorrectionConfig,
                        ...preset.config,
                      },
                    });
                  }}
                  className={`p-3 rounded-lg border-2 transition-all text-center ${
                    config.speechCorrectionPreset === key
                      ? 'border-violet-500 bg-violet-500/10'
                      : 'border-gray-700 hover:border-gray-500 bg-gray-700/30'
                  }`}
                >
                  <span className={`text-sm font-medium block ${
                    config.speechCorrectionPreset === key ? 'text-white' : 'text-gray-300'
                  }`}>
                    {preset.label}
                  </span>
                  <p className={`text-xs mt-1 ${
                    config.speechCorrectionPreset === key ? 'text-gray-300' : 'text-gray-500'
                  }`}>
                    {preset.description}
                  </p>
                </button>
              ))}
            </div>

            {/* Caption sync note */}
            {config.generateCaptions && (
              <div className="flex items-start gap-2 p-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
                <svg className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-indigo-300">
                  Captions will automatically update to match — removed words won&apos;t appear in your captions
                </p>
              </div>
            )}

            {/* Advanced settings toggle */}
            <details className="group">
              <summary className="flex items-center gap-2 cursor-pointer text-xs text-gray-500 hover:text-gray-400 transition-colors py-1">
                <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Advanced settings
              </summary>
              <div className="mt-3 space-y-3 p-3 bg-gray-700/30 rounded-lg border border-gray-700">
                {/* Language Selection */}
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Language</label>
                  <select
                    value={config.speechCorrectionConfig.language}
                    onChange={(e) => setConfig({
                      ...config,
                      speechCorrectionConfig: { ...config.speechCorrectionConfig, language: e.target.value }
                    })}
                    className="w-full p-2 rounded-lg bg-gray-700 text-gray-300 text-sm border border-gray-600 focus:ring-violet-500 focus:border-violet-500"
                  >
                    <option value="auto">Auto-detect (English)</option>
                    <option value="en">English</option>
                    <option value="fr">French</option>
                    <option value="es">Spanish</option>
                    <option value="de">German</option>
                    <option value="pt">Portuguese</option>
                  </select>
                </div>

                {/* Custom Filler Words */}
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Custom words to remove</label>
                  <input
                    type="text"
                    placeholder="e.g. literally, honestly, right (comma-separated)"
                    value={config.speechCorrectionConfig.customFillerWords.join(', ')}
                    onChange={(e) => setConfig({
                      ...config,
                      speechCorrectionConfig: {
                        ...config.speechCorrectionConfig,
                        customFillerWords: e.target.value.split(',').map(w => w.trim()).filter(Boolean),
                      }
                    })}
                    className="w-full p-2 rounded-lg bg-gray-700 text-gray-300 text-sm border border-gray-600 focus:ring-violet-500 focus:border-violet-500 placeholder-gray-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Words specific to your speaking style</p>
                </div>

                {/* Custom Filler Phrases */}
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Custom phrases to remove</label>
                  <input
                    type="text"
                    placeholder="e.g. at the end of the day, if that makes sense"
                    value={config.speechCorrectionConfig.customFillerPhrases.join(', ')}
                    onChange={(e) => setConfig({
                      ...config,
                      speechCorrectionConfig: {
                        ...config.speechCorrectionConfig,
                        customFillerPhrases: e.target.value.split(',').map(p => p.trim()).filter(Boolean),
                      }
                    })}
                    className="w-full p-2 rounded-lg bg-gray-700 text-gray-300 text-sm border border-gray-600 focus:ring-violet-500 focus:border-violet-500 placeholder-gray-500"
                  />
                </div>

                {/* Confidence Threshold */}
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">
                    Sensitivity: {Math.round(config.speechCorrectionConfig.confidenceThreshold * 100)}%
                  </label>
                  <input
                    type="range"
                    min="20"
                    max="95"
                    step="5"
                    value={Math.round(config.speechCorrectionConfig.confidenceThreshold * 100)}
                    onChange={(e) => setConfig({
                      ...config,
                      speechCorrectionPreset: null,
                      speechCorrectionConfig: {
                        ...config.speechCorrectionConfig,
                        confidenceThreshold: parseInt(e.target.value) / 100,
                      }
                    })}
                    className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-gray-600 accent-violet-500"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>More corrections</span>
                    <span>Fewer, safer</span>
                  </div>
                </div>
              </div>
            </details>
          </div>
        )}
      </div>
      )}

      {/* Captions Settings */}
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base sm:text-lg font-medium text-white">Captions</h3>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.generateCaptions}
              onChange={(e) => setConfig({ ...config, generateCaptions: e.target.checked })}
              className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-violet-500 focus:ring-violet-500"
            />
            <span className="text-gray-400">Generate captions</span>
          </label>
        </div>

        {config.generateCaptions && (
          <p className="text-xs text-gray-500">
            Clean white text on dark background - optimized for readability
          </p>
        )}
      </div>

      {/* Headline Settings */}
      <div className="space-y-3 sm:space-y-4">
        <h3 className="text-base sm:text-lg font-medium text-white">Headline Overlay</h3>

        {/* Headline Mode Selection */}
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-gray-700/50 transition-colors">
            <input
              type="radio"
              name="headlineMode"
              checked={!config.useHookAsHeadline && !config.generateAIHeadline && !config.headline}
              onChange={() => setConfig({
                ...config,
                useHookAsHeadline: false,
                generateAIHeadline: false,
                headline: ''
              })}
              className="w-4 h-4 text-violet-500 bg-gray-700 border-gray-600 focus:ring-violet-500"
            />
            <div>
              <span className="text-gray-300">No headline</span>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-gray-700/50 transition-colors">
            <input
              type="radio"
              name="headlineMode"
              checked={config.generateAIHeadline}
              onChange={() => setConfig({
                ...config,
                useHookAsHeadline: false,
                generateAIHeadline: true,
                headline: ''
              })}
              className="w-4 h-4 text-violet-500 bg-gray-700 border-gray-600 focus:ring-violet-500"
            />
            <div>
              <span className="text-gray-300">AI-generated headline</span>
              <p className="text-xs text-gray-500">Creates an engaging, scroll-stopping headline from your content</p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-gray-700/50 transition-colors">
            <input
              type="radio"
              name="headlineMode"
              checked={config.useHookAsHeadline}
              onChange={() => setConfig({
                ...config,
                useHookAsHeadline: true,
                generateAIHeadline: false,
                headline: ''
              })}
              className="w-4 h-4 text-violet-500 bg-gray-700 border-gray-600 focus:ring-violet-500"
            />
            <div>
              <span className="text-gray-300">Use hook from video</span>
              <p className="text-xs text-gray-500">Extracts the first sentence as the headline</p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-gray-700/50 transition-colors">
            <input
              type="radio"
              name="headlineMode"
              checked={!config.useHookAsHeadline && !config.generateAIHeadline && config.headline !== ''}
              onChange={() => setConfig({
                ...config,
                useHookAsHeadline: false,
                generateAIHeadline: false,
                headline: config.headline || ' '  // Set a space to trigger custom mode
              })}
              className="w-4 h-4 text-violet-500 bg-gray-700 border-gray-600 focus:ring-violet-500"
            />
            <div>
              <span className="text-gray-300">Custom headline</span>
            </div>
          </label>
        </div>

        {/* Custom headline input */}
        {!config.useHookAsHeadline && !config.generateAIHeadline && config.headline !== '' && (
          <div>
            <label className="block text-sm text-gray-400 mb-2">Headline Text</label>
            <input
              type="text"
              value={config.headline === ' ' ? '' : config.headline}
              onChange={(e) => setConfig({ ...config, headline: e.target.value || ' ' })}
              placeholder="Enter your headline"
              className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400"
            />
          </div>
        )}

        {/* Position selector - show when any headline mode is active */}
        {(config.headline || config.useHookAsHeadline || config.generateAIHeadline) && (
          <div>
            <label className="block text-sm text-gray-400 mb-2">Position</label>
            <div className="flex gap-2">
              {(['top', 'center', 'bottom'] as const).map((pos) => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => setConfig({ ...config, headlinePosition: pos })}
                  className={`flex-1 py-2 px-4 rounded-lg capitalize transition-colors ${
                    config.headlinePosition === pos
                      ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white'
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Style selector - show when any headline mode is active */}
        {(config.headline || config.useHookAsHeadline || config.generateAIHeadline) && (
          <div>
            <label className="block text-sm text-gray-400 mb-2">Style</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setConfig({ ...config, headlineStyle: 'speech-bubble' })}
                className={`p-3 rounded-lg border-2 transition-colors ${
                  config.headlineStyle === 'speech-bubble'
                    ? 'border-violet-500 bg-violet-500/10'
                    : 'border-gray-600 hover:border-gray-500'
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  {/* Speech bubble preview */}
                  <div className="relative">
                    <div className="bg-white text-black text-xs font-bold px-3 py-1.5 rounded">
                      Headline
                    </div>
                    <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-white mx-auto" />
                  </div>
                  <span className={`text-xs ${config.headlineStyle === 'speech-bubble' ? 'text-cyan-400' : 'text-gray-400'}`}>
                    Speech Bubble
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setConfig({ ...config, headlineStyle: 'classic' })}
                className={`p-3 rounded-lg border-2 transition-colors ${
                  config.headlineStyle === 'classic'
                    ? 'border-violet-500 bg-violet-500/10'
                    : 'border-gray-600 hover:border-gray-500'
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  {/* Classic preview */}
                  <div className="bg-black/60 text-white text-xs font-bold px-3 py-1.5 rounded shadow-lg">
                    Headline
                  </div>
                  <span className={`text-xs ${config.headlineStyle === 'classic' ? 'text-cyan-400' : 'text-gray-400'}`}>
                    Classic
                  </span>
                </div>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* B-Roll Animations Settings - TEMPORARILY DISABLED - Hidden on mobile */}
      <div className="hidden sm:block space-y-3 sm:space-y-4 opacity-50">
        <div className="flex items-center justify-between">
          <h3 className="text-base sm:text-lg font-medium text-white">B-Roll Animations</h3>
          <span className="text-xs text-yellow-500 bg-yellow-500/10 px-2 py-1 rounded">Coming Soon</span>
        </div>
        <p className="text-xs text-gray-500">
          AI-generated animations that appear during key moments to add visual context. This feature is currently being improved.
        </p>
      </div>

      {/* Original B-Roll UI - Hidden while feature is disabled
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base sm:text-lg font-medium text-white">B-Roll Animations</h3>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.generateBRoll}
              onChange={(e) => setConfig({ ...config, generateBRoll: e.target.checked })}
              className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-violet-500 focus:ring-violet-500"
            />
            <span className="text-gray-400">Enable B-Roll</span>
          </label>
        </div>

        {config.generateBRoll && (
          <div className="space-y-4 p-4 bg-gray-700/50 rounded-lg">
            <p className="text-xs text-gray-400">
              AI-generated animations that appear during key moments to add visual context
            </p>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Animation Style</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: 'minimal', label: 'Minimal', desc: 'Clean & subtle' },
                  { value: 'dynamic', label: 'Dynamic', desc: 'Engaging & varied' },
                  { value: 'data-focused', label: 'Data', desc: 'Charts & stats' },
                ] as const).map((style) => (
                  <button
                    key={style.value}
                    type="button"
                    onClick={() => setConfig({
                      ...config,
                      bRollConfig: { ...config.bRollConfig, style: style.value }
                    })}
                    className={`p-2 rounded-lg border-2 transition-colors text-center ${
                      config.bRollConfig.style === style.value
                        ? 'border-violet-500 bg-violet-500/10'
                        : 'border-gray-600 hover:border-gray-500'
                    }`}
                  >
                    <span className={`text-xs font-medium ${
                      config.bRollConfig.style === style.value ? 'text-cyan-400' : 'text-gray-300'
                    }`}>
                      {style.label}
                    </span>
                    <p className="text-xs text-gray-500 mt-0.5">{style.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm text-gray-400">Frequency</label>
                <span className="text-sm text-white font-medium capitalize">{config.bRollConfig.intensity}</span>
              </div>
              <div className="flex gap-2">
                {(['low', 'medium', 'high'] as const).map((intensity) => (
                  <button
                    key={intensity}
                    type="button"
                    onClick={() => setConfig({
                      ...config,
                      bRollConfig: {
                        ...config.bRollConfig,
                        intensity,
                        maxMoments: intensity === 'low' ? 2 : intensity === 'medium' ? 3 : 5,
                      }
                    })}
                    className={`flex-1 py-2 px-3 rounded-lg capitalize text-sm transition-colors ${
                      config.bRollConfig.intensity === intensity
                        ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white'
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                    }`}
                  >
                    {intensity}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {config.bRollConfig.intensity === 'low' && '2 animations - one at the start, one at a key point'}
                {config.bRollConfig.intensity === 'medium' && '3 animations - balanced throughout the video'}
                {config.bRollConfig.intensity === 'high' && '5 animations - frequent visual variety'}
              </p>
            </div>

            <div className="pt-2 border-t border-gray-600">
              <p className="text-xs text-gray-500">
                Animations include: charts, graphs, progress bars, checkmarks, comparisons, countdowns, and more - automatically selected based on your content
              </p>
            </div>
          </div>
        )}
      </div>
      */}

      {/* Save as Default & Submit Buttons */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={handleSaveAsDefault}
          disabled={isSavingDefaults || isProcessing}
          className={`w-full py-2.5 px-4 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            isSavingDefaults || isProcessing
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : saveDefaultsStatus === 'success'
              ? 'bg-green-500/20 text-green-400 border border-green-500/50'
              : saveDefaultsStatus === 'error'
              ? 'bg-red-500/20 text-red-400 border border-red-500/50'
              : 'bg-gray-700 hover:bg-gray-600 text-gray-300 border border-gray-600'
          }`}
        >
          {isSavingDefaults ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Saving...
            </>
          ) : saveDefaultsStatus === 'success' ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Saved as Default
            </>
          ) : saveDefaultsStatus === 'error' ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Failed to Save
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              Save as Default for Auto-Processing
            </>
          )}
        </button>
        <p className="text-xs text-gray-500 text-center">
          Save these settings to use them automatically when auto-processing is enabled
        </p>
      </div>

      <button
        type="submit"
        disabled={isProcessing}
        className={`w-full py-3 px-6 rounded-lg font-medium transition-colors ${
          isProcessing
            ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
            : 'bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white'
        }`}
      >
        {isProcessing ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Processing...
          </span>
        ) : (
          videoCount > 1 ? `Process ${videoCount} Videos` : 'Process Video'
        )}
      </button>
    </form>
  );
}
