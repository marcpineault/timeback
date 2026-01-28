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
  useHookAsHeadline: boolean;
  generateAIHeadline: boolean;  // Use AI to generate engaging headline
  generateBRoll: boolean;
  bRollConfig: BRollConfig;
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
      captionStyle: 'instagram',
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
      captionStyle: 'instagram',
      normalizeAudio: true,
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
    headlineStyle: 'speech-bubble',
    captionStyle: 'instagram',
    silenceThreshold: -30,
    silenceDuration: 0.5,
    useHookAsHeadline: false,
    generateAIHeadline: false,
    generateBRoll: false,
    bRollConfig: {
      style: 'dynamic',
      intensity: 'medium',
      maxMoments: 3,
    },
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
              className="w-4 h-4 text-blue-500 bg-gray-700 border-gray-600 focus:ring-blue-500"
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
              className="w-4 h-4 text-blue-500 bg-gray-700 border-gray-600 focus:ring-blue-500"
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
              className="w-4 h-4 text-blue-500 bg-gray-700 border-gray-600 focus:ring-blue-500"
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
              className="w-4 h-4 text-blue-500 bg-gray-700 border-gray-600 focus:ring-blue-500"
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
              value={config.headline.trim()}
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
                    ? 'border-blue-500 bg-blue-500/10'
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
                  <span className={`text-xs ${config.headlineStyle === 'speech-bubble' ? 'text-blue-400' : 'text-gray-400'}`}>
                    Speech Bubble
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setConfig({ ...config, headlineStyle: 'classic' })}
                className={`p-3 rounded-lg border-2 transition-colors ${
                  config.headlineStyle === 'classic'
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-gray-600 hover:border-gray-500'
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  {/* Classic preview */}
                  <div className="bg-black/60 text-white text-xs font-bold px-3 py-1.5 rounded shadow-lg">
                    Headline
                  </div>
                  <span className={`text-xs ${config.headlineStyle === 'classic' ? 'text-blue-400' : 'text-gray-400'}`}>
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
              className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500"
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
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-gray-600 hover:border-gray-500'
                    }`}
                  >
                    <span className={`text-xs font-medium ${
                      config.bRollConfig.style === style.value ? 'text-blue-400' : 'text-gray-300'
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
                        ? 'bg-blue-500 text-white'
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
