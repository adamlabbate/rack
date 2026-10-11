import type { NextConfig } from "next";

// The FastAPI server. The browser never talks to it directly: everything goes through this
// origin, so one tunnel (or one LAN address) covers the app, the API and the images.
const API = "http://localhost:8000";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Let a phone on the same Wi-Fi (or hotspot), or a cloudflared tunnel, use the dev server.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.trycloudflare.com"],
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API}/:path*` },
      { source: "/static/:path*", destination: `${API}/static/:path*` },
    ];
  },
  experimental: {
    proxyTimeout: 120_000, // the stylist takes 15-40s; the default 30s would cut it off
    proxyClientMaxBodySize: "25mb", // full-size phone photos
  },
  // The demo runs on the dev server; the badge would cover the Closet tab. Errors still show.
  devIndicators: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
