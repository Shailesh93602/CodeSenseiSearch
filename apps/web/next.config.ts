import type { NextConfig } from "next";

/**
 * Next.js 16 config. Consolidated from the legacy next.config.js — the
 * webpack splitChunks overrides there were ignored anyway because
 * Next 16 defaults to Turbopack.
 */
const nextConfig: NextConfig = {
  reactCompiler: true,

  // Standalone output keeps the Vercel + Docker images small —
  // copies just the runtime, not node_modules + source.
  output: "standalone",

  experimental: {
    optimizePackageImports: ["lucide-react"],
  },

  // AVIF first, generous device-size buckets.
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 2_592_000, // 30 days
  },

  // Strip the X-Powered-By header — small but standard hardening.
  poweredByHeader: false,

  async headers() {
    // Security + caching headers. The Express app uses helmet for
    // these; on Next we set them at the framework level so static
    // assets get them too.
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
      {
        // Hashed static assets — cache forever.
        source: "/_next/static/(.*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
