'use client';

import { useState, useEffect } from 'react';

interface ProcessingOptionsProps {
  onProcess: (options: ProcessingConfig) => void;
  isProcessing: boolean;
  uploadedFile: {
    fileId: string;
    filename: string;
    originalName: string;
  } | null;
  videoCount?: number;
}

export type HeadlineStyle = 'classic' | 'speech-bubble' | 'clean';

export type CaptionStyle = 'instagram' | 'minimal';

export type SilencePreset = 'natural' | 'gentle';

export interface ProcessingConfig {
  generateCaptions: boolean;
  headline: string;
  headlinePosition: 'top' | 'center' | 'bottom';
  headlineStyle: HeadlineStyle;
  captionStyle: CaptionStyle;
  silenceThreshold: number;
  silenceDuration: number;
  autoSilenceThreshold: boolean;
  silencePreset: SilencePreset;
  useHookAsHeadline: boolean;
  generateAIHeadline: boolean;
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
      generateCaptions: true,
      captionStyle: 'instagram',

      autoSilenceThreshold: true,
      silenceDuration: 0.4,
    },
  },
  'instagram-reels': {
    name: 'Instagram Reels',
    icon: '📸',
    config: {
      generateCaptions: true,
      captionStyle: 'instagram',

      autoSilenceThreshold: true,
      silenceDuration: 0.3,
    },
  },
  'youtube': {
    name: 'YouTube',
    icon: '▶️',
    config: {
      generateCaptions: true,
      captionStyle: 'instagram',

      autoSilenceThreshold: true,
      silenceDuration: 0.5,
    },
  },
  'instagram-feed': {
    name: 'Instagram Feed',
    icon: '🖼️',
    config: {
      generateCaptions: true,
      captionStyle: 'instagram',

      autoSilenceThreshold: true,
    },
  },
};

// localStorage key for persisting processing config
const STORAGE_KEY = 'timeback_processing_config';

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
  silencePreset: 'natural',
  useHookAsHeadline: false,
  generateAIHeadline: false,
};

export default function ProcessingOptions({
  onProcess,
  isProcessing,
  uploadedFile,
  videoCount = 1,
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
    <form onSubmit={handleSubmit} className="bg-white border border-[#e0dbd4] rounded-2xl p-4 sm:p-6 space-y-5 sm:space-y-6">
      <div className="flex items-center gap-3 pb-3 sm:pb-4 border-b border-[#e0dbd4]">
        <svg className="w-5 h-5 sm:w-6 sm:h-6 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <div className="min-w-0">
          <p className="text-[#0a0a0a] font-medium text-sm sm:text-base truncate">
            {videoCount > 1 ? `${videoCount} videos` : uploadedFile.originalName}
          </p>
          <p className="text-[#8a8580] text-xs sm:text-sm">
            {videoCount > 1 ? 'Same settings will apply to all videos' : 'Ready to process'}
          </p>
        </div>
      </div>

      {/* Silence Removal Settings */}
      <div className="space-y-3 sm:space-y-4">
        <h3 className="text-base sm:text-lg font-medium text-[#0a0a0a]">Silence Removal</h3>

        {/* Editing Style Presets */}
        <div className="grid grid-cols-2 gap-2">
          {([
            { key: 'natural' as SilencePreset, label: 'Natural', desc: 'Conversational, podcast style' },
            { key: 'gentle' as SilencePreset, label: 'Gentle', desc: 'Minimal editing, lectures' },
          ]).map(({ key, label, desc }) => (
            <button
              key={key}
              type="button"
              onClick={() => setConfig({ ...config, silencePreset: key, autoSilenceThreshold: true })}
              className={`p-3 rounded-2xl border text-center transition-all ${
                config.silencePreset === key
                  ? 'border-[#e85d26] bg-[#e85d26]/5 ring-1 ring-[#e85d26]'
                  : 'border-[#e0dbd4] hover:border-[#c5bfb8]'
              }`}
            >
              <span className={`block text-xs sm:text-sm font-medium ${
                config.silencePreset === key ? 'text-[#e85d26]' : 'text-[#0a0a0a]'
              }`}>
                {label}
              </span>
              <span className="block text-[10px] sm:text-xs text-[#8a8580] mt-0.5 leading-tight">
                {desc}
              </span>
            </button>
          ))}
        </div>

        {/* Auto-detect toggle */}
        <div className="flex items-center justify-between p-3 bg-[#f5f0e8] rounded-2xl">
          <div>
            <span className="text-sm text-[#0a0a0a]">Smart detection (AI-powered)</span>
            <p className="text-xs text-[#8a8580] mt-0.5">
              Uses neural voice detection for precise silence removal
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config.autoSilenceThreshold}
              onChange={(e) => setConfig({ ...config, autoSilenceThreshold: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-[#e0dbd4] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#e85d26] rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#e85d26]"></div>
          </label>
        </div>

        {/* Manual threshold controls - only show when auto is disabled */}
        {!config.autoSilenceThreshold && (
          <div className="space-y-3 sm:space-y-4 p-3 border border-[#e0dbd4] rounded-2xl">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs sm:text-sm text-[#8a8580]">
                  Silence Threshold
                </label>
                <span className="text-xs sm:text-sm text-[#0a0a0a] font-medium">{config.silenceThreshold} dB</span>
              </div>
              <input
                type="range"
                value={config.silenceThreshold}
                onChange={(e) => setConfig({ ...config, silenceThreshold: Number(e.target.value) })}
                className="w-full h-2 bg-[#e0dbd4] rounded-full appearance-none cursor-pointer accent-[#e85d26]"
                min="-50"
                max="-15"
                step="1"
              />
              <div className="flex justify-between text-xs text-[#8a8580] mt-1">
                <span>Less aggressive</span>
                <span>More aggressive</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs sm:text-sm text-[#8a8580]">
                  Min Silence Duration
                </label>
                <span className="text-xs sm:text-sm text-[#0a0a0a] font-medium">{config.silenceDuration}s</span>
              </div>
              <input
                type="range"
                value={config.silenceDuration}
                onChange={(e) => setConfig({ ...config, silenceDuration: Number(e.target.value) })}
                className="w-full h-2 bg-[#e0dbd4] rounded-full appearance-none cursor-pointer accent-[#e85d26]"
                min="0.2"
                max="2"
                step="0.1"
              />
              <div className="flex justify-between text-xs text-[#8a8580] mt-1">
                <span>Short pauses</span>
                <span>Long pauses</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Captions Settings */}
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base sm:text-lg font-medium text-[#0a0a0a]">Captions</h3>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.generateCaptions}
              onChange={(e) => setConfig({ ...config, generateCaptions: e.target.checked })}
              className="w-5 h-5 rounded bg-[#e0dbd4] border-[#e0dbd4] text-[#e85d26] focus:ring-[#e85d26]"
            />
            <span className="text-[#8a8580]">Generate captions</span>
          </label>
        </div>

        {config.generateCaptions && (
          <div>
            <label className="block text-sm text-[#8a8580] mb-2">Style</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setConfig({ ...config, captionStyle: 'instagram' })}
                className={`p-3 rounded-2xl border-2 transition-colors ${
                  config.captionStyle === 'instagram'
                    ? 'border-[#e85d26] bg-[#e85d26]/10'
                    : 'border-[#e0dbd4] hover:border-[#8a8580]'
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  <div className="bg-black/50 text-white text-xs font-bold px-3 py-1.5 rounded">
                    Caption
                  </div>
                  <span className={`text-xs ${config.captionStyle === 'instagram' ? 'text-[#e85d26]' : 'text-[#8a8580]'}`}>
                    Boxed
                  </span>
                  <p className="text-xs text-[#8a8580] text-center">
                    White text on dark background
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setConfig({ ...config, captionStyle: 'minimal' })}
                className={`p-3 rounded-2xl border-2 transition-colors ${
                  config.captionStyle === 'minimal'
                    ? 'border-[#e85d26] bg-[#e85d26]/10'
                    : 'border-[#e0dbd4] hover:border-[#8a8580]'
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  <div className="text-white text-xs font-bold px-3 py-1.5"
                       style={{ WebkitTextStroke: '0.5px black', textShadow: '1px 1px 2px rgba(0,0,0,0.8), -1px -1px 2px rgba(0,0,0,0.8)' }}>
                    Caption
                  </div>
                  <span className={`text-xs ${config.captionStyle === 'minimal' ? 'text-[#e85d26]' : 'text-[#8a8580]'}`}>
                    Minimal
                  </span>
                  <p className="text-xs text-[#8a8580] text-center">
                    Clean outline, no background
                  </p>
                </div>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Headline Settings */}
      <div className="space-y-3 sm:space-y-4">
        <h3 className="text-base sm:text-lg font-medium text-[#0a0a0a]">Headline Overlay</h3>

        {/* Headline Mode Selection */}
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer p-2 rounded-2xl hover:bg-[#e0dbd4]/50 transition-colors">
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
              className="w-4 h-4 text-[#e85d26] bg-[#e0dbd4] border-[#e0dbd4] focus:ring-[#e85d26]"
            />
            <div>
              <span className="text-[#0a0a0a]">No headline</span>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer p-2 rounded-2xl hover:bg-[#e0dbd4]/50 transition-colors">
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
              className="w-4 h-4 text-[#e85d26] bg-[#e0dbd4] border-[#e0dbd4] focus:ring-[#e85d26]"
            />
            <div>
              <span className="text-[#0a0a0a]">AI-generated headline</span>
              <p className="text-xs text-[#8a8580]">Creates an engaging, scroll-stopping headline from your content</p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer p-2 rounded-2xl hover:bg-[#e0dbd4]/50 transition-colors">
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
              className="w-4 h-4 text-[#e85d26] bg-[#e0dbd4] border-[#e0dbd4] focus:ring-[#e85d26]"
            />
            <div>
              <span className="text-[#0a0a0a]">Use hook from video</span>
              <p className="text-xs text-[#8a8580]">Extracts the first sentence as the headline</p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer p-2 rounded-2xl hover:bg-[#e0dbd4]/50 transition-colors">
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
              className="w-4 h-4 text-[#e85d26] bg-[#e0dbd4] border-[#e0dbd4] focus:ring-[#e85d26]"
            />
            <div>
              <span className="text-[#0a0a0a]">Custom headline</span>
            </div>
          </label>
        </div>

        {/* Custom headline input */}
        {!config.useHookAsHeadline && !config.generateAIHeadline && config.headline !== '' && (
          <div>
            <label className="block text-sm text-[#8a8580] mb-2">Headline Text</label>
            <input
              type="text"
              value={config.headline === ' ' ? '' : config.headline}
              onChange={(e) => setConfig({ ...config, headline: e.target.value || ' ' })}
              placeholder="Enter your headline"
              className="w-full bg-white border border-gray-300 rounded-2xl px-4 py-3 text-gray-900 placeholder-gray-400"
            />
          </div>
        )}

        {/* Position selector - show when any headline mode is active */}
        {(config.headline || config.useHookAsHeadline || config.generateAIHeadline) && (
          <div>
            <label className="block text-sm text-[#8a8580] mb-2">Position</label>
            <div className="flex gap-2">
              {(['top', 'center', 'bottom'] as const).map((pos) => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => setConfig({ ...config, headlinePosition: pos })}
                  className={`flex-1 py-2 px-4 rounded-full capitalize transition-colors ${
                    config.headlinePosition === pos
                      ? 'bg-[#e85d26] text-[#0a0a0a]'
                      : 'bg-[#e0dbd4] text-[#8a8580] hover:bg-[#e0dbd4]'
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
            <label className="block text-sm text-[#8a8580] mb-2">Style</label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setConfig({ ...config, headlineStyle: 'speech-bubble' })}
                className={`p-3 rounded-2xl border-2 transition-colors ${
                  config.headlineStyle === 'speech-bubble'
                    ? 'border-[#e85d26] bg-[#e85d26]/10'
                    : 'border-[#e0dbd4] hover:border-[#8a8580]'
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  {/* Instagram style preview */}
                  <div className="bg-white text-black text-xs font-bold px-4 py-2 rounded-2xl">
                    Headline
                  </div>
                  <span className={`text-xs ${config.headlineStyle === 'speech-bubble' ? 'text-[#e85d26]' : 'text-[#8a8580]'}`}>
                    Instagram
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setConfig({ ...config, headlineStyle: 'classic' })}
                className={`p-3 rounded-2xl border-2 transition-colors ${
                  config.headlineStyle === 'classic'
                    ? 'border-[#e85d26] bg-[#e85d26]/10'
                    : 'border-[#e0dbd4] hover:border-[#8a8580]'
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  {/* Classic preview */}
                  <div className="bg-black/60 text-white text-xs font-bold px-4 py-2 rounded-2xl shadow-lg">
                    Headline
                  </div>
                  <span className={`text-xs ${config.headlineStyle === 'classic' ? 'text-[#e85d26]' : 'text-[#8a8580]'}`}>
                    Classic
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setConfig({ ...config, headlineStyle: 'clean' })}
                className={`p-3 rounded-2xl border-2 transition-colors ${
                  config.headlineStyle === 'clean'
                    ? 'border-[#e85d26] bg-[#e85d26]/10'
                    : 'border-[#e0dbd4] hover:border-[#8a8580]'
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  {/* Clean preview - no background */}
                  <div className="text-white text-xs font-medium px-4 py-2"
                       style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.5)' }}>
                    Headline
                  </div>
                  <span className={`text-xs ${config.headlineStyle === 'clean' ? 'text-[#e85d26]' : 'text-[#8a8580]'}`}>
                    Clean
                  </span>
                </div>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Save as Default & Submit Buttons */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={handleSaveAsDefault}
          disabled={isSavingDefaults || isProcessing}
          className={`w-full py-2.5 px-4 rounded-full text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            isSavingDefaults || isProcessing
              ? 'bg-[#e0dbd4] text-[#8a8580] cursor-not-allowed'
              : saveDefaultsStatus === 'success'
              ? 'bg-green-500/20 text-green-400 border border-green-500/50'
              : saveDefaultsStatus === 'error'
              ? 'bg-red-500/20 text-red-400 border border-red-500/50'
              : 'bg-[#e0dbd4] hover:bg-[#e0dbd4] text-[#0a0a0a] border border-[#e0dbd4]'
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
        <p className="text-xs text-[#8a8580] text-center">
          Save these settings to use them automatically when auto-processing is enabled
        </p>
      </div>

      <button
        type="submit"
        disabled={isProcessing}
        className={`w-full py-3 px-6 rounded-full font-medium transition-colors ${
          isProcessing
            ? 'bg-[#e0dbd4] text-[#8a8580] cursor-not-allowed'
            : 'bg-[#e85d26] hover:bg-[#d14d1a] text-[#0a0a0a]'
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
