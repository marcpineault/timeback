import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
  },
  // Increase timeout for video processing
  serverExternalPackages: ["fluent-ffmpeg"],
};

export default nextConfig;
