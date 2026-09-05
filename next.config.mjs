import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Set the output file tracing root to the current project directory
  // This silences the warning about multiple lockfiles
  outputFileTracingRoot: __dirname,
  transpilePackages: ['@fairlx/mcp-server', '@fairlx/multi-agent'],
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
          resource.request = resource.request.replace(/^node:/, "");
        }),
      );
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false,
      };
    }
    return config;
  },
  experimental: {
    staleTimes: {
      dynamic: 30,  // Cache dynamic pages for 30s on client navigation
      static: 180,  // Cache static pages for 3 min
    },
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.output = {
        ...config.output,
        chunkLoadTimeout: 300_000,
      };
    }
    return config;
  },
  images: {
    minimumCacheTTL: 3600, // Cache optimized images for 1 hour
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'storage.fairlx.com',
      },
    ],
  },
};

export default nextConfig;