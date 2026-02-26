import type { NextConfig } from "next";

// Railway build - ensure env vars are loaded
const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    serverActions: {
      bodySizeLimit: "500mb",
    },
  },
  // Increase timeout for video processing
  serverExternalPackages: ["fluent-ffmpeg", "onnxruntime-node", "@ricky0123/vad-node"],
  // Skip type-checking during `next build` — the Railway build container is
  // memory-constrained and the TS checker alone pushes past the heap limit.
  // Types should be validated in CI (e.g. `tsc --noEmit`) instead.
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
