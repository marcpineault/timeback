'use client';

import { useState } from 'react';

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

export type AspectRatioPreset = 'original' | '9:16' | '16:9' | '1:1' | '4:5';

export interface ProcessingConfig {
  generateCaptions: boolean;
  headline: string;
  headlinePosition: 'top' | 'center' | 'bottom';
  captionStyle: 'tiktok' | 'tiktok-bold' | 'tiktok-outline' | 'instagram' | 'instagram-clean' | 'instagram-bold' | 'youtube' | 'animated';
  silenceThreshold: number;
  silenceDuration: number;
  useHookAsHeadline: boolean;
  generateBRoll: boolean;
  normalizeAudio: boolean;
  colorGrade: 'none' | 'warm' | 'cool' | 'cinematic' | 'vibrant' | 'vintage';
  autoZoom: boolean;
  autoZoomIntensity: number;
  aspectRatio: AspectRatioPreset;
  // Speech correction options
  speechCorrection: boolean;
  speechCorrectionConfig: {
    removeFillerWords: boolean;
    removeRepeatedWords: boolean;
    removeFalseStarts: boolean;
    removeSelfCorrections: boolean;
    aggressiveness: 'conservative' | 'moderate' | 'aggressive';
  };
}

// Processing presets for quick configuration
type PresetKey = 'custom' | 'tiktok' | 'youtube-shorts' | 'instagram-reels' | 'youtube' | 'instagram-feed';

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
  'tiktok': {
    name: 'TikTok',
    icon: '📱',
    config: {
      aspectRatio: '9:16',
      generateCaptions: true,
      captionStyle: 'tiktok-bold',
      normalizeAudio: true,
      silenceThreshold: -30,
      silenceDuration: 0.3,
    },
  },
  'youtube-shorts': {
    name: 'YouTube Shorts',
    icon: '🎬',
    config: {
      aspectRatio: '9:16',
      generateCaptions: true,
      captionStyle: 'youtube',
      normalizeAudio: true,
      silenceThreshold: -30,
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
      silenceThreshold: -30,
      silenceDuration: 0.3,
    },
  },
  'youtube': {
    name: 'YouTube',
    icon: '▶️',
    config: {
      aspectRatio: '16:9',
      generateCaptions: true,
      captionStyle: 'youtube',
      normalizeAudio: true,
      silenceThreshold: -35,
      silenceDuration: 0.5,
    },
  },
  'instagram-feed': {
    name: 'Instagram Feed',
    icon: '🖼️',
    config: {
      aspectRatio: '1:1',
      generateCaptions: true,
      captionStyle: 'instagram-bold',
      normalizeAudio: true,
    },
  },
};

const ASPECT_RATIO_OPTIONS: { value: AspectRatioPreset; label: string; platforms: string }[] = [
  { value: 'original', label: 'Original', platforms: 'Keep as-is' },
  { value: '9:16', label: '9:16 Vertical', platforms: 'TikTok, Reels, Shorts' },
  { value: '16:9', label: '16:9 Landscape', platforms: 'YouTube, Twitter' },
  { value: '1:1', label: '1:1 Square', platforms: 'Instagram Feed' },
  { value: '4:5', label: '4:5 Portrait', platforms: 'Instagram, Facebook' },
];

export default function ProcessingOptions({
  onProcess,
  isProcessing,
  uploadedFile,
  videoCount = 1,
}: ProcessingOptionsProps) {
  const [config, setConfig] = useState<ProcessingConfig>({
    generateCaptions: true,
    headline: '',
    headlinePosition: 'top',
    captionStyle: 'tiktok',
    silenceThreshold: -30,
    silenceDuration: 0.5,
    useHookAsHeadline: false,
    generateBRoll: false,
    normalizeAudio: true,
    colorGrade: 'none',
    autoZoom: false,
    autoZoomIntensity: 5,
    aspectRatio: 'original',
    speechCorrection: false,
    speechCorrectionConfig: {
      removeFillerWords: true,
      removeRepeatedWords: true,
      removeFalseStarts: true,
      removeSelfCorrections: true,
      aggressiveness: 'moderate',
    },
  });
  const [activePreset, setActivePreset] = useState<PresetKey>('custom');

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

  if (!uploadedFile) return null;

  return (
    <form onSubmit={handleSubmit} className="bg-gray-800 rounded-xl p-4 sm:p-6 space-y-5 sm:space-y-6">
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

        <div className="space-y-3 sm:space-y-4">
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
              max="-20"
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
      </div>

      {/* Audio Enhancement Settings */}
      <div className="space-y-3 sm:space-y-4">
        <h3 className="text-base sm:text-lg font-medium text-white">Audio Enhancement</h3>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.normalizeAudio}
            onChange={(e) => setConfig({ ...config, normalizeAudio: e.target.checked })}
            className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500"
          />
          <span className="text-gray-400">Normalize audio levels</span>
        </label>
        <p className="text-xs text-gray-500">
          Ensures consistent volume throughout the video (-14 LUFS, optimal for social media)
        </p>
      </div>

      {/* Captions Settings */}
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base sm:text-lg font-medium text-white">Captions</h3>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.generateCaptions}
              onChange={(e) => setConfig({ ...config, generateCaptions: e.target.checked })}
              className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500"
            />
            <span className="text-gray-400">Generate captions</span>
          </label>
        </div>

        {config.generateCaptions && (
          <div>
            <label className="block text-sm text-gray-400 mb-2">Caption Style</label>
            <select
              value={config.captionStyle}
              onChange={(e) => setConfig({ ...config, captionStyle: e.target.value as ProcessingConfig['captionStyle'] })}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
            >
              <optgroup label="TikTok Style">
                <option value="tiktok">TikTok (Bold white, black outline)</option>
                <option value="tiktok-bold">TikTok Bold (Larger, impact font)</option>
                <option value="tiktok-outline">TikTok Outline (Heavy outline)</option>
              </optgroup>
              <optgroup label="Instagram Style">
                <option value="instagram">Instagram (White on dark box)</option>
                <option value="instagram-clean">Instagram Clean (Subtle shadow)</option>
                <option value="instagram-bold">Instagram Bold (Stronger box)</option>
              </optgroup>
              <optgroup label="YouTube Style">
                <option value="youtube">YouTube (Clean with dark background)</option>
              </optgroup>
            </select>
          </div>
        )}
      </div>

      {/* Headline Settings */}
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base sm:text-lg font-medium text-white">Headline Overlay</h3>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.useHookAsHeadline}
              onChange={(e) => setConfig({
                ...config,
                useHookAsHeadline: e.target.checked,
                headline: e.target.checked ? '' : config.headline
              })}
              className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500"
            />
            <span className="text-gray-400">Use hook from video</span>
          </label>
        </div>

        {config.useHookAsHeadline ? (
          <p className="text-sm text-gray-500">
            The first sentence from the video will be used as the headline with a background box.
          </p>
        ) : (
          <div>
            <label className="block text-sm text-gray-400 mb-2">Headline Text</label>
            <input
              type="text"
              value={config.headline}
              onChange={(e) => setConfig({ ...config, headline: e.target.value })}
              placeholder="Enter headline (optional)"
              className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400"
            />
          </div>
        )}

        {(config.headline || config.useHookAsHeadline) && (
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
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isProcessing}
        className={`w-full py-3 px-6 rounded-lg font-medium transition-colors ${
          isProcessing
            ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
            : 'bg-blue-500 hover:bg-blue-600 text-white'
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
