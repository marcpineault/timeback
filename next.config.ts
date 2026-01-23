import type { NextConfig } from "next";

// Railway build - ensure env vars are loaded
const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    serverActions: {
      bodySizeLimit: "500mb",
    },
  },
  // Increase body size limit for video uploads (default is 10MB)
  // This applies to API routes and middleware
  proxyClientMaxBodySize: "500mb",
  // Increase timeout for video processing
  serverExternalPackages: ["fluent-ffmpeg"],
};

export default nextConfig;
