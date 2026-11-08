import type { NextConfig } from "next";
import path from "node:path";

const API_TARGET = process.env.API_PROXY_TARGET || "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  turbopack: { root: path.join(__dirname, "../..") },
  transpilePackages: ["@clementiq/shared-types"],
  poweredByHeader: false,
  // The dev-tools badge sat on top of the profile avatar; error overlays still work without it.
  devIndicators: false,
  // Same-origin API: the browser calls /api/*, Next proxies to FastAPI (no CORS, no exposed backend URL).
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_TARGET}/api/:path*` }];
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
      ],
    }];
  },
};

export default nextConfig;
