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

export interface ProcessingConfig {
  generateCaptions: boolean;
  headline: string;
  headlinePosition: 'top' | 'center' | 'bottom';
  captionStyle: 'default' | 'bold' | 'outline' | 'animated';
  silenceThreshold: number;
  silenceDuration: number;
  useHookAsHeadline: boolean;
  generateBRoll: boolean;
  normalizeAudio: boolean;
  colorGrade: 'none' | 'warm' | 'cool' | 'cinematic' | 'vibrant' | 'vintage';
  autoZoom: boolean;
  autoZoomIntensity: number;
}

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
    captionStyle: 'default',
    silenceThreshold: -30,
    silenceDuration: 0.5,
    useHookAsHeadline: false,
    generateBRoll: false,
    normalizeAudio: true,
    colorGrade: 'none',
    autoZoom: false,
    autoZoomIntensity: 5,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onProcess(config);
  };

  if (!uploadedFile) return null;

  return (
    <form onSubmit={handleSubmit} className="bg-gray-800 rounded-xl p-6 space-y-6">
      <div className="flex items-center gap-3 pb-4 border-b border-gray-700">
        <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <div>
          <p className="text-white font-medium">
            {videoCount > 1 ? `${videoCount} videos` : uploadedFile.originalName}
          </p>
          <p className="text-gray-500 text-sm">
            {videoCount > 1 ? 'Same settings will apply to all videos' : 'Ready to process'}
          </p>
        </div>
      </div>

      {/* Silence Removal Settings */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-white">Silence Removal</h3>

        <div className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm text-gray-400">
                Silence Threshold
              </label>
              <span className="text-sm text-white font-medium">{config.silenceThreshold} dB</span>
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
              <span>Less aggressive (-50dB)</span>
              <span>More aggressive (-20dB)</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm text-gray-400">
                Min Silence Duration
              </label>
              <span className="text-sm text-white font-medium">{config.silenceDuration}s</span>
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
              <span>Cut short pauses (0.2s)</span>
              <span>Only long pauses (2s)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Audio Enhancement Settings */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-white">Audio Enhancement</h3>
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

      {/* Color Grading Settings */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-white">Color Grading</h3>
        <select
          value={config.colorGrade}
          onChange={(e) => setConfig({ ...config, colorGrade: e.target.value as ProcessingConfig['colorGrade'] })}
          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
        >
          <option value="none">None (Original colors)</option>
          <option value="warm">Warm (Golden, cozy tones)</option>
          <option value="cool">Cool (Blue, professional tones)</option>
          <option value="cinematic">Cinematic (Contrast + teal/orange)</option>
          <option value="vibrant">Vibrant (Saturated, punchy)</option>
          <option value="vintage">Vintage (Faded, nostalgic)</option>
        </select>
      </div>

      {/* Auto-Zoom Settings */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-white">Auto-Zoom</h3>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.autoZoom}
              onChange={(e) => setConfig({ ...config, autoZoom: e.target.checked })}
              className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500"
            />
            <span className="text-gray-400">Zoom during speech</span>
          </label>
        </div>
        {config.autoZoom && (
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Zoom Intensity: {config.autoZoomIntensity}%
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={config.autoZoomIntensity}
              onChange={(e) => setConfig({ ...config, autoZoomIntensity: Number(e.target.value) })}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
            <p className="text-xs text-gray-500 mt-1">
              Subtle zoom effect during speaking for increased engagement
            </p>
          </div>
        )}
      </div>

      {/* Captions Settings */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-white">Captions</h3>
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
              <option value="default">Default (White with outline)</option>
              <option value="bold">Bold (Larger, thicker)</option>
              <option value="outline">Outline (Black outline)</option>
              <option value="animated">Animated (Word-by-word highlight)</option>
            </select>
            {config.captionStyle === 'animated' && (
              <p className="text-sm text-yellow-400 mt-2">
                Words highlight one-by-one as they are spoken - great for engagement!
              </p>
            )}
          </div>
        )}
      </div>

      {/* AI B-Roll Settings */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-white">AI B-Roll</h3>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.generateBRoll}
              onChange={(e) => setConfig({ ...config, generateBRoll: e.target.checked })}
              className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500"
            />
            <span className="text-gray-400">Generate AI visuals</span>
          </label>
        </div>
        {config.generateBRoll && (
          <p className="text-sm text-gray-500">
            AI will analyze the transcript and generate relevant visuals as full-screen cutaways at key moments.
          </p>
        )}
      </div>

      {/* Headline Settings */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-white">Headline Overlay</h3>
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
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500"
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
