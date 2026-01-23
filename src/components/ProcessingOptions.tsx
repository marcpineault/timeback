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
    silenceThreshold: -20,
    silenceDuration: 0.5,
    useHookAsHeadline: false,
    generateBRoll: false,
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

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Silence Threshold (dB)
            </label>
            <input
              type="number"
              value={config.silenceThreshold}
              onChange={(e) => setConfig({ ...config, silenceThreshold: Number(e.target.value) })}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
              min="-60"
              max="0"
            />
            <p className="text-xs text-gray-500 mt-1">Lower = more sensitive</p>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Min Silence Duration (s)
            </label>
            <input
              type="number"
              value={config.silenceDuration}
              onChange={(e) => setConfig({ ...config, silenceDuration: Number(e.target.value) })}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
              min="0.1"
              max="5"
              step="0.1"
            />
            <p className="text-xs text-gray-500 mt-1">Minimum length to cut</p>
          </div>
        </div>
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
