import type { NextConfig } from "next";

// Railway build - ensure env vars are loaded
const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
  },
  // Increase timeout for video processing
  serverExternalPackages: ["fluent-ffmpeg"],
};

export default nextConfig;
